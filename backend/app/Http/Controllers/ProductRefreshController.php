<?php

namespace App\Http\Controllers;

use App\Services\BooksToScrapeLookupService;
use App\Services\ProductLookupException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class ProductRefreshController extends Controller
{
    public function __invoke(Request $request, string $product, BooksToScrapeLookupService $lookup): JsonResponse
    {
        try {
            $result = DB::transaction(function () use ($product, $lookup, $request) {
                $record = $request->user()->products()->whereKey($product)->lockForUpdate()->first();
                if (! $record) {
                    return null;
                }
                if (strcasecmp($record->store, 'Liverpool') === 0) {
                    throw new ProductLookupException('La actualización automática de Liverpool no está disponible. Ingresa manualmente un precio confirmado en MXN.', 422);
                }

                $previousPrice = (float) $record->current_price;
                $lookupResult = $lookup->lookup($record->url);
                $currentPrice = (float) $lookupResult['current_price'];
                if ($currentPrice <= 0) {
                    throw new ProductLookupException('La fuente devolvió un precio no válido. El precio guardado no se modificó.');
                }

                $direction = $currentPrice <=> $previousPrice;
                $checkedAt = now();
                $record->last_checked_at = $checkedAt;

                if ($direction !== 0) {
                    $record->current_price = $lookupResult['current_price'];
                    $record->priceHistories()->create([
                        'price' => $lookupResult['current_price'],
                        'recorded_at' => $checkedAt,
                    ]);
                }

                $record->save();
                $record->load(['priceHistories' => function ($query) {
                    $query->orderBy('recorded_at')->orderBy('id');
                }]);

                return [
                    'product' => $record,
                    'previous_price' => number_format($previousPrice, 2, '.', ''),
                    'current_price' => number_format($currentPrice, 2, '.', ''),
                    'changed' => $direction !== 0,
                    'direction' => $direction < 0 ? 'down' : ($direction > 0 ? 'up' : 'unchanged'),
                    'reached_target' => $record->target_price !== null && $currentPrice <= (float) $record->target_price,
                ];
            });

            if ($result === null) {
                return response()->json(['message' => 'No se encontró el producto solicitado.'], 404);
            }

            return response()->json([
                'message' => match ($result['direction']) {
                    'down' => 'El precio bajó y se agregó un registro al historial.',
                    'up' => 'El precio subió y se agregó un registro al historial.',
                    default => 'El precio no cambió; el historial se conservó sin agregar un punto.',
                },
                'data' => $result,
            ]);
        } catch (ProductLookupException $exception) {
            return response()->json(['message' => $exception->getMessage()], $exception->status);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'No se pudo actualizar el precio. El precio e historial guardados no se modificaron.',
            ], 500);
        }
    }
}
