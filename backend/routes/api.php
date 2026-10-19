<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ProductLookupController;
use App\Http\Controllers\ProductManualPriceController;
use App\Http\Controllers\ProductRefreshController;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

Route::post('/products/lookup', ProductLookupController::class);
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('/mobile-register', [AuthController::class, 'mobileRegister'])
        ->middleware('throttle:5,1')
        ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class);
    Route::post('/mobile-login', [AuthController::class, 'mobileLogin'])
        ->middleware('throttle:10,1')
        ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::patch('/profile', [AuthController::class, 'updateProfile']);
        Route::patch('/password', [AuthController::class, 'updatePassword']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/products', [ProductController::class, 'index']);
    Route::post('/products', [ProductController::class, 'store']);
    Route::patch('/products/{product}', [ProductController::class, 'update'])->whereNumber('product');
    Route::get('/products/{product}/history', [ProductController::class, 'history'])->whereNumber('product');
    Route::post('/products/{product}/refresh', ProductRefreshController::class)->whereNumber('product');
    Route::post('/products/{product}/manual-price', ProductManualPriceController::class)->whereNumber('product');
    Route::patch('/products/{product}/target', [ProductController::class, 'updateTarget'])->whereNumber('product');
    Route::patch('/products/{product}/variant', [ProductController::class, 'updateVariant'])->whereNumber('product');
    Route::get('/products/{product}', [ProductController::class, 'show'])->whereNumber('product');
    Route::delete('/products/{product}', [ProductController::class, 'destroy'])->whereNumber('product');
});
