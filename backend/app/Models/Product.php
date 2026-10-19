<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = [
        'name',
        'store',
        'url',
        'sku',
        'variant_name',
        'image',
        'current_price',
        'currency',
        'target_price',
        'last_checked_at',
    ];

    protected function casts(): array
    {
        return [
            'current_price' => 'decimal:2',
            'target_price' => 'decimal:2',
            'last_checked_at' => 'datetime',
        ];
    }

    public function priceHistories(): HasMany
    {
        return $this->hasMany(PriceHistory::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
