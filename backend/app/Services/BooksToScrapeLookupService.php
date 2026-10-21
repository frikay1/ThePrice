<?php

namespace App\Services;

use DOMDocument;
use DOMXPath;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Throwable;

class BooksToScrapeLookupService
{
    private const HOST = 'books.toscrape.com';

    private const MAX_RESPONSE_BYTES = 2_097_152;

    private const MAX_EXPOSED_HTML_BYTES = 262_144;

    public function __construct(private readonly PublicIpv4Resolver $resolver) {}

    public function lookup(string $url): array
    {
        $productUrl = $this->validateProductUrl($url);
        $ipAddress = $this->resolver->resolve(self::HOST);
        if (filter_var($ipAddress, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            throw new ProductLookupException('La dirección del sitio no es segura para consultar.', 422);
        }

        try {
            $response = Http::withOptions([
                'allow_redirects' => false,
                'curl' => [
                    CURLOPT_RESOLVE => [self::HOST.':443:'.$ipAddress],
                    CURLOPT_MAXFILESIZE => self::MAX_RESPONSE_BYTES,
                ],
            ])->timeout(12)
                ->connectTimeout(5)
                ->withHeaders(['User-Agent' => 'PriceTracker product lookup (Books to Scrape demo)'])
                ->get($productUrl);
        } catch (ConnectionException $exception) {
            report($exception);

            throw new ProductLookupException('No se pudo conectar con el sitio de demostración. Puedes completar los datos manualmente.');
        } catch (Throwable $exception) {
            report($exception);

            throw new ProductLookupException('No fue posible consultar el sitio de demostración. Puedes completar los datos manualmente.');
        }

        if ($response->redirect()) {
            throw new ProductLookupException('El sitio respondió con una redirección y no se siguió por seguridad.');
        }

        if (! $response->successful()) {
            throw new ProductLookupException('El sitio no pudo proporcionar la página del producto. Puedes completar los datos manualmente.');
        }

        if (strlen($response->body()) > self::MAX_RESPONSE_BYTES) {
            throw new ProductLookupException('La página del producto es demasiado grande para procesarla.');
        }

        $html = $response->body();

        return [
            ...$this->parseProductPage($html, $productUrl),
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
            throw new ProductLookupException('No se pudieron leer los datos de la página del producto.');
        }

        $xpath = new DOMXPath($document);
        $name = trim($xpath->evaluate('string(//div[contains(concat(" ", normalize-space(@class), " "), " product_main ")]/h1)'));
        $priceText = trim($xpath->evaluate('string(//div[contains(concat(" ", normalize-space(@class), " "), " product_main ")]/p[contains(concat(" ", normalize-space(@class), " "), " price_color ")])'));
        $imagePath = trim($xpath->evaluate('string(//div[contains(concat(" ", normalize-space(@class), " "), " item ")]//img/@src)'));

        if ($name === '' || ! preg_match('/^£\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)$/u', $priceText, $priceMatches)) {
            throw new ProductLookupException('No se encontró un nombre y un precio claros en la página. Puedes completar los datos manualmente.');
        }

        $price = (float) str_replace(',', '', $priceMatches[1]);
        if ($price <= 0) {
            throw new ProductLookupException('El precio de la página no es válido. Puedes completar los datos manualmente.');
        }

        return [
            'name' => $name,
            'store' => 'Books to Scrape',
            'url' => $productUrl,
            'image' => $imagePath === '' ? null : $this->resolveImageUrl($imagePath, $productUrl),
            'current_price' => number_format($price, 2, '.', ''),
            'currency' => 'GBP',
            'is_demo' => true,
            'notice' => 'Books to Scrape es un sitio de demostración; sus precios no representan ofertas comerciales reales.',
        ];
    }

    private function validateProductUrl(string $url): string
    {
        if (strlen($url) > 2048 || preg_match('/[\x00-\x20\x7f\\\\%]/', $url)) {
            throw new ProductLookupException('Usa la URL HTTPS de un producto de Books to Scrape.', 422);
        }

        $parts = parse_url($url);
        if (
            $parts === false
            || strtolower($parts['scheme'] ?? '') !== 'https'
            || strtolower($parts['host'] ?? '') !== self::HOST
            || isset($parts['user'])
            || isset($parts['pass'])
            || (isset($parts['port']) && $parts['port'] !== 443)
            || isset($parts['query'])
            || isset($parts['fragment'])
            || ! preg_match('~^/catalogue/[a-z0-9][a-z0-9-]*_[0-9]+/index\.html$~', $parts['path'] ?? '')
        ) {
            throw new ProductLookupException('Solo se admiten páginas HTTPS de productos de Books to Scrape.', 422);
        }

        return 'https://'.self::HOST.$parts['path'];
    }

    private function resolveImageUrl(string $imagePath, string $productUrl): ?string
    {
        if (str_starts_with($imagePath, '//')) {
            $imagePath = 'https:'.$imagePath;
        } elseif (! preg_match('~^https?://~i', $imagePath)) {
            $basePath = dirname(parse_url($productUrl, PHP_URL_PATH) ?: '/');
            $segments = [];
            foreach (explode('/', $basePath.'/'.$imagePath) as $segment) {
                if ($segment === '' || $segment === '.') {
                    continue;
                }
                if ($segment === '..') {
                    array_pop($segments);
                } else {
                    $segments[] = $segment;
                }
            }
            $imagePath = '/'.implode('/', $segments);
        }

        $parts = parse_url($imagePath);
        if (
            $parts === false
            || (isset($parts['scheme']) && strtolower($parts['scheme']) !== 'https')
            || (isset($parts['host']) && strtolower($parts['host']) !== self::HOST)
            || isset($parts['user'])
            || isset($parts['pass'])
            || (isset($parts['port']) && $parts['port'] !== 443)
            || ! str_starts_with($parts['path'] ?? '', '/media/')
            || isset($parts['query'])
            || isset($parts['fragment'])
        ) {
            return null;
        }

        return 'https://'.self::HOST.$parts['path'];
    }
}
