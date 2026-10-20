<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Symfony\Component\HttpFoundation\Response;

class EnsureStatefulWebSessionForProductRequests
{
    public function __construct(
        private EnsureFrontendRequestsAreStateful $statefulMiddleware
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (
            $request->bearerToken() !== null
            || $request->headers->get('Origin') === 'https://localhost'
        ) {
            return $next($request);
        }

        return $this->statefulMiddleware->handle($request, $next);
    }
}
