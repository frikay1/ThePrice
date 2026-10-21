<?php

namespace App\Services;

use DOMDocument;
use DOMXPath;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Throwable;

class AmazonMexicoLookupService
{
    private const HOST = 'www.amazon.com.mx';

    private const MAX_RESPONSE_BYTES = 3_145_728;

    private const MAX_EXPOSED_HTML_BYTES = 262_144;

    public function __construct(private readonly PublicIpv4Resolver $resolver) {}

    public function lookup(string $url): array
    {
        $productUrl = $this->validateProductUrl($url);
        $ipAddress = $this->resolver->resolve(self::HOST);
        if (filter_var($ipAddress, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            throw new ProductLookupException('La dirección de Amazon no es segura para consultar.', 422);
        }

        try {
            $response = Http::withOptions([
                'allow_redirects' => false,
                'curl' => [
                    CURLOPT_RESOLVE => [self::HOST.':443:'.$ipAddress],
                    CURLOPT_MAXFILESIZE => self::MAX_RESPONSE_BYTES,
                ],
            ])->timeout(15)
                ->connectTimeout(5)
                ->withHeaders([
                    'Accept' => 'text/html,application/xhtml+xml',
                    'User-Agent' => 'ThePrice product price lookup',
                ])
                ->get($productUrl);
        } catch (ConnectionException $exception) {
            report($exception);

            throw new ProductLookupException('Amazon no permitió acceder a la página del producto. No se obtuvo un precio.');
        } catch (Throwable $exception) {
            report($exception);

            throw new ProductLookupException('No fue posible consultar Amazon. No se obtuvo un precio.');
        }

        if ($response->redirect()) {
            throw new ProductLookupException('Amazon respondió con una redirección; no se siguió por seguridad.');
        }

        if (! $response->successful()) {
            throw new ProductLookupException('Amazon no permitió acceder a la página del producto. No se obtuvo un precio.');
        }

        $html = $response->body();
        if (strlen($html) > self::MAX_RESPONSE_BYTES) {
            throw new ProductLookupException('La página de Amazon es demasiado grande para procesarla.');
        }

        if (preg_match('/robot check|validatecaptcha|id=["\']captchacharacters["\']/i', $html)) {
            throw new ProductLookupException('Amazon mostró una página de verificación. No se intentó evadirla y no se obtuvo un precio.');
        }

        $result = $this->parseProductPage($html, $productUrl);

        return [
            ...$result,
            'html' => mb_strcut($html, 0, self::MAX_EXPOSED_HTML_BYTES, 'UTF-8'),
            'html_truncated' => strlen($html) > self::MAX_EXPOSED_HTML_BYTES,
        ];
    }

    public function parseProductPage(string $html, string $productUrl): array
    {
        $previous = libxml_use_internal_errors(true);
        $document = new DOMDocument;

        try {
            $loaded = $document->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }

        if (! $loaded) {
            throw new ProductLookupException('Amazon no devolvió una página de producto legible.');
        }

        $xpath = new DOMXPath($document);
        $structuredProducts = $this->structuredProducts($xpath);
        $name = $this->firstText($xpath, [
            '//*[@id="productTitle"]',
            '//meta[@property="og:title"]/@content',
        ]);
        $image = $this->firstText($xpath, [
            '//*[@id="landingImage"]/@data-old-hires',
            '//*[@id="landingImage"]/@src',
            '//meta[@property="og:image"]/@content',
        ]);
        $priceText = $this->firstText($xpath, [
            '//*[@id="corePrice_feature_div"]//*[contains(concat(" ", normalize-space(@class), " "), " a-offscreen ")]',
            '//*[@id="corePriceDisplay_desktop_feature_div"]//*[contains(concat(" ", normalize-space(@class), " "), " a-offscreen ")]',
            '//*[@id="apex_offerDisplay_desktop"]//*[contains(concat(" ", normalize-space(@class), " "), " a-offscreen ")]',
            '//*[@id="price_inside_buybox"]',
            '//*[@id="priceblock_dealprice"]',
            '//*[@id="priceblock_ourprice"]',
            '//meta[@property="product:price:amount"]/@content',
        ]);

        $price = $this->parsePrice($priceText);
        $currency = 'MXN';
        if ($price === null) {
            foreach ($structuredProducts as $product) {
                foreach ($this->offers($product['offers'] ?? []) as $offer) {
                    $offerCurrency = strtoupper((string) ($offer['priceCurrency'] ?? ''));
                    $offerPrice = $this->parsePrice((string) ($offer['price'] ?? $offer['lowPrice'] ?? ''));
                    if ($offerPrice === null || ($offerCurrency !== '' && $offerCurrency !== 'MXN')) {
                        continue;
                    }
                    $price = $offerPrice;
                    break 2;
                }
            }
        }

        if ($price === null) {
            throw new ProductLookupException('Amazon no proporcionó un precio de venta actual accesible. No se usó el precio anterior, envío ni una mensualidad.');
        }

        $structuredProduct = $structuredProducts[0] ?? [];
        $name ??= $this->plainText($structuredProduct['name'] ?? null);
        $image ??= $this->structuredImage($structuredProduct['image'] ?? null);
        if ($name === null || $name === '') {
            throw new ProductLookupException('Amazon no proporcionó el nombre del producto en los datos accesibles.');
        }
        $image = $image === null ? null : $this->validateImageUrl($image);
        $availability = $this->firstText($xpath, [
            '//*[@id="availability"]',
        ]);
        $availability ??= $this->availability($structuredProduct['offers'] ?? []);

        return [
            'name' => $name ?? '',
            'store' => 'Amazon México',
            'url' => $productUrl,
            'image' => $image,
            'current_price' => number_format($price, 2, '.', ''),
            'currency' => $currency,
            'is_demo' => false,
            'availability' => $availability,
            'notice' => 'Precio leído de los datos públicos accesibles de Amazon; verifica que corresponda a la variante seleccionada.',
        ];
    }

    private function validateProductUrl(string $url): string
    {
        if (strlen($url) > 2048 || preg_match('/[\x00-\x20\x7f\\\\]/', $url)) {
            throw new ProductLookupException('Usa la URL HTTPS de un producto de Amazon México.', 422);
        }

        $parts = parse_url($url);
        if (
            $parts === false
            || strtolower($parts['scheme'] ?? '') !== 'https'
            || ! in_array(strtolower($parts['host'] ?? ''), ['amazon.com.mx', 'www.amazon.com.mx'], true)
            || isset($parts['user'])
            || isset($parts['pass'])
            || (isset($parts['port']) && $parts['port'] !== 443)
            || ! preg_match('~/(?:dp|gp/product|gp/aw/d)/([A-Z0-9]{10})(?:/|$)~i', $parts['path'] ?? '', $matches)
        ) {
            throw new ProductLookupException('Solo se admiten fichas HTTPS de producto de Amazon México.', 422);
        }

        return 'https://'.self::HOST.'/dp/'.strtoupper($matches[1]);
    }

    private function firstText(DOMXPath $xpath, array $expressions): ?string
    {
        foreach ($expressions as $expression) {
            $value = trim(preg_replace('/\s+/u', ' ', $xpath->evaluate('string('.$expression.')') ?: '') ?? '');
            if ($value !== '') {
                return $value;
            }
        }

        return null;
    }

    private function parsePrice(?string $text): ?float
    {
        if ($text === null) {
            return null;
        }

        if (! preg_match('/(?:MXN|MX\$|\\$)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)/u', $text, $matches)) {
            return null;
        }

        $price = (float) str_replace(',', '', $matches[1]);

        return $price > 0 && $price <= 9_999_999_999.99 ? $price : null;
    }

    private function structuredProducts(DOMXPath $xpath): array
    {
        $products = [];
        foreach ($xpath->query('//script[@type="application/ld+json"]') ?: [] as $script) {
            $decoded = json_decode($script->textContent, true);
            if (! is_array($decoded)) {
                continue;
            }

            foreach ($this->flattenStructuredData($decoded) as $item) {
                if (is_array($item) && $this->hasProductType($item['@type'] ?? null)) {
                    $products[] = $item;
                }
            }
        }

        return $products;
    }

    private function flattenStructuredData(array $data): array
    {
        if (array_is_list($data)) {
            return array_merge(...array_map(
                fn ($item) => is_array($item) ? $this->flattenStructuredData($item) : [],
                $data
            ));
        }

        $items = [$data];
        if (isset($data['@graph']) && is_array($data['@graph'])) {
            $items = array_merge($items, $this->flattenStructuredData($data['@graph']));
        }

        return $items;
    }

    private function hasProductType(mixed $type): bool
    {
        foreach ((array) $type as $value) {
            if (is_string($value) && preg_match('~(?:^|[/#])Product$~', $value)) {
                return true;
            }
        }

        return false;
    }

    private function offers(mixed $offers): array
    {
        if (! is_array($offers)) {
            return [];
        }
        if (array_is_list($offers)) {
            return array_values(array_filter($offers, 'is_array'));
        }

        return [$offers];
    }

    private function structuredImage(mixed $image): ?string
    {
        if (is_string($image)) {
            return $image;
        }
        if (is_array($image)) {
            foreach ($image as $value) {
                $candidate = $this->structuredImage($value);
                if ($candidate !== null) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    private function availability(mixed $offers): ?string
    {
        foreach ($this->offers($offers) as $offer) {
            $availability = $offer['availability'] ?? null;
            if (is_string($availability) && $availability !== '') {
                return str_contains($availability, '/') ? substr($availability, strrpos($availability, '/') + 1) : $availability;
            }
        }

        return null;
    }

    private function plainText(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        $value = trim($value);

        return $value === '' ? null : $value;
    }

    private function validateImageUrl(string $url): ?string
    {
        $parts = parse_url($url);
        if (
            $parts === false
            || strtolower($parts['scheme'] ?? '') !== 'https'
            || ! is_string($parts['host'] ?? null)
            || isset($parts['user'])
            || isset($parts['pass'])
        ) {
            return null;
        }

        return $url;
    }
}
