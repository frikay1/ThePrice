<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Throwable;

class ProductManualPriceController extends Controller
{
    public function __invoke(Request $request, string $product): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'price' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999.99'],
        ], [
            'price.required' => 'Ingresa el nuevo precio en MXN.',
            'price.numeric' => 'El precio debe ser numérico.',
            'price.gt' => 'El precio debe ser mayor que cero.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'El precio enviado no es válido.',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $result = DB::transaction(function () use ($product, $validator, $request) {
                $record = $request->user()->products()->whereKey($product)->lockForUpdate()->first();
                if (! $record) {
                    return null;
                }
                if ($record->currency !== 'MXN') {
                    return ['unsupported_product' => true];
                }

                $newPrice = number_format((float) $validator->validated()['price'], 2, '.', '');
                $previousPrice = number_format((float) $record->current_price, 2, '.', '');
                $direction = ((int) round((float) $newPrice * 100)) <=> ((int) round((float) $previousPrice * 100));
                $recordedAt = null;

                if ($direction !== 0) {
                    $recordedAt = now();
                    $record->current_price = $newPrice;
                    $record->last_checked_at = $recordedAt;
                    $record->priceHistories()->create([
                        'price' => $newPrice,
                        'recorded_at' => $recordedAt,
                    ]);
                    $record->save();
                }

                $record->load(['priceHistories' => function ($query) {
                    $query->orderBy('recorded_at')->orderBy('id');
                }]);

                return [
                    'product' => $record,
                    'previous_price' => $previousPrice,
                    'current_price' => $direction === 0 ? $previousPrice : $newPrice,
                    'changed' => $direction !== 0,
                    'direction' => $direction < 0 ? 'down' : ($direction > 0 ? 'up' : 'unchanged'),
                    'reached_target' => $record->target_price !== null && (float) $record->current_price <= (float) $record->target_price,
                    'recorded_at' => $recordedAt?->toISOString(),
                ];
            });

            if ($result === null) {
                return response()->json(['message' => 'No se encontró el producto solicitado.'], 404);
            }
            if (($result['unsupported_product'] ?? false) === true) {
                return response()->json([
                    'message' => 'El registro manual está disponible para productos con precio en MXN.',
                ], 422);
            }

            return response()->json([
                'message' => $result['changed']
                    ? 'El precio se registró correctamente.'
                    : 'El precio sigue igual. No se agregó un punto al historial.',
                'data' => $result,
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'No se pudo registrar el precio. El precio y el historial anteriores se conservaron.',
            ], 500);
        }
    }
}
