<?php

namespace App\Http\Controllers;

use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Throwable;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        try {
            $products = $request->user()->products()->with(['priceHistories' => function ($query) {
                $query->orderBy('recorded_at')->orderBy('id');
            }])->orderByDesc('created_at')->get();

            return response()->json([
                'data' => $products,
            ]);
        } catch (QueryException $exception) {
            report($exception);

            return $this->databaseError();
        }
    }

    public function show(Request $request, string $product): JsonResponse
    {
        try {
            $record = $request->user()->products()->with(['priceHistories' => function ($query) {
                $query->orderBy('recorded_at')->orderBy('id');
            }])->whereKey($product)->first();

            if (! $record) {
                return response()->json([
                    'message' => 'No se encontró el producto solicitado.',
                ], 404);
            }

            return response()->json([
                'data' => $record,
            ]);
        } catch (QueryException $exception) {
            report($exception);

            return $this->databaseError();
        }
    }

    public function history(Request $request, string $product): JsonResponse
    {
        try {
            $record = $request->user()->products()->whereKey($product)->first();
            if (! $record) {
                return response()->json(['message' => 'No se encontró el producto solicitado.'], 404);
            }

            return response()->json([
                'data' => $record->priceHistories()->orderBy('recorded_at')->orderBy('id')->get(),
            ]);
        } catch (QueryException $exception) {
            report($exception);

            return $this->databaseError();
        }
    }

    public function update(Request $request, string $product): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:255'],
            'store' => ['required', 'string', 'max:255'],
            'url' => ['required', 'url:https'],
            'sku' => ['present', 'nullable', 'string', 'max:100'],
            'variant_name' => ['present', 'nullable', 'string', 'max:255', 'not_regex:/,/'],
            'image' => ['present', 'nullable', 'url:https'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Los datos del producto no son válidos.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $data = $validator->validated();
        $host = strtolower(rtrim((string) parse_url($data['url'], PHP_URL_HOST), '.'));
        if ($host === 'books.toscrape.com' || str_ends_with($host, '.books.toscrape.com')) {
            return response()->json([
                'message' => 'Books to Scrape es una fuente de demostración y sus productos no se pueden guardar.',
            ], 422);
        }

        $isLiverpoolHost = $host === 'liverpool.com.mx' || str_ends_with($host, '.liverpool.com.mx');
        if ($isLiverpoolHost || strcasecmp($data['store'], 'Liverpool') === 0) {
            $parts = parse_url($data['url']);
            if (
                ! $isLiverpoolHost
                || strcasecmp($data['store'], 'Liverpool') !== 0
                || isset($parts['user'])
                || isset($parts['pass'])
                || (isset($parts['port']) && $parts['port'] !== 443)
                || ! preg_match('~^/tienda/pdp/[^/]+/[0-9]+/?$~i', $parts['path'] ?? '')
            ) {
                return response()->json([
                    'message' => 'Para Liverpool, usa una ficha HTTPS oficial de producto.',
                ], 422);
            }
        }

        try {
            $record = $request->user()->products()->whereKey($product)->first();
            if (! $record) {
                return response()->json(['message' => 'No se encontró el producto solicitado.'], 404);
            }

            $record->fill($data);
            $record->save();

            return response()->json([
                'message' => 'Producto actualizado correctamente.',
                'data' => $record->load(['priceHistories' => function ($query) {
                    $query->orderBy('recorded_at')->orderBy('id');
                }]),
            ]);
        } catch (QueryException $exception) {
            report($exception);

            return $this->databaseError();
        }
    }

    public function updateTarget(Request $request, string $product): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'target_price' => ['present', 'nullable', 'numeric', 'decimal:0,2', 'min:0.01', 'max:9999999999.99'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'El precio objetivo enviado no es válido.',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $record = $request->user()->products()->whereKey($product)->first();
            if (! $record) {
                return response()->json(['message' => 'No se encontró el producto solicitado.'], 404);
            }

            $record->target_price = $validator->validated()['target_price'];
            $record->save();

            return response()->json([
                'message' => 'Precio objetivo guardado correctamente.',
                'data' => $record,
                'reached_target' => $record->target_price !== null && (float) $record->current_price <= (float) $record->target_price,
            ]);
        } catch (QueryException $exception) {
            report($exception);

            return $this->databaseError();
        }
    }

    public function updateVariant(Request $request, string $product): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'variant_name' => ['present', 'nullable', 'string', 'max:255', 'not_regex:/,/'],
        ], [
            'variant_name.not_regex' => 'Ingresa una sola variante seleccionada, sin enumerar varias opciones.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'La variante enviada no es válida.',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $record = $request->user()->products()->whereKey($product)->first();
            if (! $record) {
                return response()->json(['message' => 'No se encontró el producto solicitado.'], 404);
            }

            $variantName = $validator->validated()['variant_name'];
            $record->variant_name = $variantName === null ? null : trim($variantName);
            $record->save();

            return response()->json([
                'message' => 'Variante actualizada correctamente.',
                'data' => $record,
            ]);
        } catch (QueryException $exception) {
            report($exception);

            return $this->databaseError();
        }
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:255'],
            'store' => ['required', 'string', 'max:255'],
            'url' => ['required', 'url:http,https'],
            'sku' => ['nullable', 'string', 'max:100'],
            'variant_name' => ['nullable', 'string', 'max:255'],
            'image' => ['nullable', 'url:http,https'],
            'current_price' => ['required', 'numeric', 'decimal:0,2', 'min:0.01', 'max:9999999999.99'],
            'currency' => ['sometimes', 'required', 'string', 'in:MXN'],
            'target_price' => ['nullable', 'numeric', 'decimal:0,2', 'min:0.01', 'max:9999999999.99'],
            'history' => ['prohibited'],
            'histories' => ['prohibited'],
            'priceHistory' => ['prohibited'],
            'price_history' => ['prohibited'],
            'price_histories' => ['prohibited'],
            'priceHistories' => ['prohibited'],
        ], [
            'history.prohibited' => 'El historial de precios lo genera el servidor y no puede enviarse.',
            'histories.prohibited' => 'El historial de precios lo genera el servidor y no puede enviarse.',
            'priceHistory.prohibited' => 'El historial de precios lo genera el servidor y no puede enviarse.',
            'price_history.prohibited' => 'El historial de precios lo genera el servidor y no puede enviarse.',
            'price_histories.prohibited' => 'El historial de precios lo genera el servidor y no puede enviarse.',
            'priceHistories.prohibited' => 'El historial de precios lo genera el servidor y no puede enviarse.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Los datos enviados no son válidos.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $data = $validator->validated();
        $host = strtolower(rtrim((string) parse_url($data['url'], PHP_URL_HOST), '.'));
        if ($host === 'books.toscrape.com' || str_ends_with($host, '.books.toscrape.com')) {
            return response()->json([
                'message' => 'Books to Scrape es una fuente de demostración y sus productos no se pueden guardar.',
                'errors' => ['url' => ['Usa Books to Scrape únicamente para probar la extracción; no se guardan sus precios.']],
            ], 422);
        }
        $isLiverpoolHost = $host === 'liverpool.com.mx' || str_ends_with($host, '.liverpool.com.mx');
        if ($isLiverpoolHost || strcasecmp($data['store'], 'Liverpool') === 0) {
            $parts = parse_url($data['url']);
            $path = $parts['path'] ?? '';
            if (
                strtolower($parts['scheme'] ?? '') !== 'https'
                || ! ($host === 'liverpool.com.mx' || str_ends_with($host, '.liverpool.com.mx'))
                || strcasecmp($data['store'], 'Liverpool') !== 0
                || isset($parts['user'])
                || isset($parts['pass'])
                || (isset($parts['port']) && $parts['port'] !== 443)
                || ! preg_match('~^/tienda/pdp/[^/]+/[0-9]+/?$~i', $path)
                || (isset($data['variant_name']) && str_contains($data['variant_name'], ','))
            ) {
                return response()->json([
                    'message' => 'El producto de Liverpool debe usar una ficha HTTPS oficial y una sola variante seleccionada.',
                    'errors' => ['url' => ['Usa el enlace oficial a la ficha del producto de Liverpool y captura una sola variante.']],
                ], 422);
            }
        }

        $checkedAt = now();

        try {
            $product = DB::transaction(function () use ($data, $checkedAt, $request) {
                $product = $request->user()->products()->create([
                    'name' => $data['name'],
                    'store' => $data['store'],
                    'url' => $data['url'],
                    'sku' => $data['sku'] ?? null,
                    'variant_name' => $data['variant_name'] ?? null,
                    'image' => $data['image'] ?? null,
                    'current_price' => $data['current_price'],
                    'currency' => $data['currency'] ?? 'MXN',
                    'target_price' => $data['target_price'] ?? null,
                    'last_checked_at' => $checkedAt,
                ]);

                $product->priceHistories()->create([
                    'price' => $data['current_price'],
                    'recorded_at' => $checkedAt,
                ]);

                return $product;
            });

            return response()->json([
                'message' => 'Producto guardado correctamente.',
                'data' => $product->load('priceHistories'),
            ], 201);
        } catch (Throwable $exception) {
            report($exception);

            return $this->databaseError();
        }
    }

    public function destroy(Request $request, string $product): JsonResponse
    {
        try {
            $record = $request->user()->products()->whereKey($product)->first();

            if (! $record) {
                return response()->json([
                    'message' => 'No se encontró el producto solicitado.',
                ], 404);
            }

            $record->delete();

            return response()->json([
                'message' => 'Producto eliminado correctamente.',
            ]);
        } catch (QueryException $exception) {
            report($exception);

            return $this->databaseError();
        }
    }

    private function databaseError(): JsonResponse
    {
        return response()->json([
            'message' => 'No se pudo completar la operación. Inténtalo de nuevo más tarde.',
        ], 500);
    }
}
