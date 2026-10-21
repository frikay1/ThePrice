<?php

namespace App\Http\Controllers;

use App\Services\AmazonMexicoLookupService;
use App\Services\BooksToScrapeLookupService;
use App\Services\ProductLookupException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Throwable;

class ProductLookupController extends Controller
{
    public function __invoke(
        Request $request,
        BooksToScrapeLookupService $booksLookup,
        AmazonMexicoLookupService $amazonLookup
    ): JsonResponse {
        $validator = Validator::make($request->all(), [
            'url' => ['required', 'string', 'max:2048'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'La URL enviada no es válida.',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $url = $validator->validated()['url'];
            $host = strtolower(rtrim((string) parse_url($url, PHP_URL_HOST), '.'));
            $data = match ($host) {
                'books.toscrape.com' => $booksLookup->lookup($url),
                'amazon.com.mx', 'www.amazon.com.mx' => $amazonLookup->lookup($url),
                default => throw new ProductLookupException('Por ahora solo se consultan Books to Scrape y Amazon México.', 422),
            };

            if ($request->user('sanctum') === null) {
                unset($data['html'], $data['html_truncated']);
            }

            return response()->json([
                'data' => $data,
            ]);
        } catch (ProductLookupException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], $exception->status);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'No fue posible obtener los datos del producto. Puedes completarlos manualmente.',
            ], 502);
        }
    }
}
