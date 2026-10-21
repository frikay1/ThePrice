<?php

namespace App\Http\Controllers;

use App\Services\BooksToScrapeLookupService;
use App\Services\ProductLookupException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Throwable;

class ProductLookupController extends Controller
{
    public function __invoke(Request $request, BooksToScrapeLookupService $lookup): JsonResponse
    {
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
            $data = $lookup->lookup($validator->validated()['url']);

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
