<?php

namespace App\Services;

use RuntimeException;

class ProductLookupException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 502)
    {
        parent::__construct($message);
    }
}
