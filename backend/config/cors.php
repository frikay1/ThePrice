<?php

$configuredOrigins = env('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173');
$allowedOrigins = array_values(array_unique(array_merge(
    array_filter(array_map('trim', explode(',', $configuredOrigins))),
    ['https://localhost'],
)));

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => $allowedOrigins,
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
