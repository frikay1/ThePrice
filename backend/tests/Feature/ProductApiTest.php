<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use App\Services\BooksToScrapeLookupService;
use App\Services\ProductLookupException;
use App\Services\PublicIpv4Resolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Mockery;
use Tests\TestCase;

class ProductApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->actingAs($this->user);
    }

    public function test_product_creation_saves_initial_price_history_in_same_request(): void
    {
        $response = $this->postJson('/api/products', [
            'name' => 'Audífonos',
            'store' => 'Tienda de prueba',
            'url' => 'https://example.com/product',
            'current_price' => '1299.00',
        ]);

        $response->assertCreated()
            ->assertJsonPath('message', 'Producto guardado correctamente.')
            ->assertJsonPath('data.currency', 'MXN')
            ->assertJsonPath('data.price_histories.0.price', '1299.00');

        $this->assertDatabaseCount('products', 1);
        $this->assertDatabaseCount('price_histories', 1);
        $this->assertDatabaseHas('price_histories', [
            'product_id' => $response->json('data.id'),
            'price' => '1299.00',
        ]);
    }

    public function test_product_creation_rejects_client_supplied_price_history(): void
    {
        $response = $this->postJson('/api/products', [
            'name' => 'Audífonos',
            'store' => 'Tienda de prueba',
            'url' => 'https://example.com/product',
            'current_price' => 1299,
            'price_histories' => [
                ['price' => 1, 'recorded_at' => '2020-01-01 00:00:00'],
            ],
        ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors('price_histories');

        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('price_histories', 0);
    }

    public function test_product_creation_accepts_optional_variant_fields(): void
    {
        $response = $this->postJson('/api/products', [
            'name' => 'Juego de colchón y box Invictus',
            'store' => 'Liverpool',
            'url' => 'https://www.liverpool.com.mx/tienda/pdp/producto/1105826407',
            'sku' => '1105476023',
            'variant_name' => 'Individual',
            'current_price' => 7349.25,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.sku', '1105476023')
            ->assertJsonPath('data.variant_name', 'Individual');

        $this->assertDatabaseHas('products', [
            'id' => $response->json('data.id'),
            'sku' => '1105476023',
            'variant_name' => 'Individual',
        ]);
        $this->assertDatabaseCount('price_histories', 1);
    }

    public function test_liverpool_product_can_be_saved_manually_in_mxn_with_variant_and_sku(): void
    {
        $response = $this->postJson('/api/products', [
            'name' => 'Colchón seleccionado por usuario',
            'store' => 'Liverpool',
            'url' => 'https://www.liverpool.com.mx/tienda/pdp/producto-ejemplo/1234567890?skuid=1234567891&size=King',
            'current_price' => '1599.00',
            'currency' => 'MXN',
            'image' => 'https://www.liverpool.com.mx/media/producto.jpg',
            'variant_name' => 'King',
            'sku' => '1234567891',
            'target_price' => '1500.00',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.store', 'Liverpool')
            ->assertJsonPath('data.url', 'https://www.liverpool.com.mx/tienda/pdp/producto-ejemplo/1234567890?skuid=1234567891&size=King')
            ->assertJsonPath('data.currency', 'MXN')
            ->assertJsonPath('data.variant_name', 'King')
            ->assertJsonPath('data.sku', '1234567891')
            ->assertJsonPath('data.price_histories.0.price', '1599.00');

        $this->assertDatabaseCount('products', 1);
        $this->assertDatabaseCount('price_histories', 1);
    }

    public function test_liverpool_products_reject_unofficial_or_non_product_urls(): void
    {
        foreach ([
            'https://www.liverpool.com.mx.evil.example/tienda/pdp/producto/1234567890',
            'http://www.liverpool.com.mx/tienda/pdp/producto/1234567890',
            'https://www.liverpool.com.mx/tienda?s=producto',
        ] as $url) {
            $this->postJson('/api/products', [
                'name' => 'Product',
                'store' => 'Liverpool',
                'url' => $url,
                'current_price' => 1599,
                'currency' => 'MXN',
            ])->assertUnprocessable()
                ->assertJsonValidationErrors('url');
        }

        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('price_histories', 0);
    }

    public function test_liverpool_refresh_is_explicitly_unavailable_and_does_not_change_data(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Liverpool product',
            'store' => 'Liverpool',
            'url' => 'https://www.liverpool.com.mx/tienda/pdp/producto/1234567890',
            'current_price' => '1599.00',
            'currency' => 'MXN',
        ])->assertCreated();
        $productId = $creation->json('data.id');

        $this->postJson("/api/products/{$productId}/refresh")->assertUnprocessable()
            ->assertJsonPath('message', 'La actualización automática de Liverpool no está disponible. Ingresa manualmente un precio confirmado en MXN.');

        $this->assertDatabaseHas('products', ['id' => $productId, 'current_price' => '1599.00', 'currency' => 'MXN']);
        $this->assertDatabaseCount('price_histories', 1);
    }

    public function test_manual_liverpool_price_drop_updates_product_history_and_preserves_other_fields(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Manual price test',
            'store' => 'Liverpool',
            'url' => 'https://www.liverpool.com.mx/tienda/pdp/producto-ejemplo/1234567890?skuid=1234567891&size=King',
            'current_price' => '1599.00',
            'currency' => 'MXN',
            'image' => 'https://www.liverpool.com.mx/media/producto.jpg',
            'variant_name' => 'King',
            'sku' => '1234567891',
            'target_price' => '1500.00',
        ])->assertCreated();
        $productId = $creation->json('data.id');

        $this->postJson("/api/products/{$productId}/manual-price", ['price' => '1499.00'])
            ->assertOk()
            ->assertJsonPath('message', 'El precio se registró correctamente.')
            ->assertJsonPath('data.previous_price', '1599.00')
            ->assertJsonPath('data.current_price', '1499.00')
            ->assertJsonPath('data.direction', 'down')
            ->assertJsonPath('data.changed', true)
            ->assertJsonPath('data.reached_target', true)
            ->assertJsonPath('data.product.current_price', '1499.00')
            ->assertJsonPath('data.product.target_price', '1500.00')
            ->assertJsonPath('data.product.image', 'https://www.liverpool.com.mx/media/producto.jpg')
            ->assertJsonPath('data.product.variant_name', 'King')
            ->assertJsonPath('data.product.sku', '1234567891');

        $this->assertNotNull($creation->json('data.price_histories.0.recorded_at'));
        $this->assertNotNull($this->getJson("/api/products/{$productId}/history")->json('data.1.recorded_at'));
        $this->assertDatabaseHas('products', ['id' => $productId, 'current_price' => '1499.00']);
        $this->assertDatabaseHas('price_histories', ['product_id' => $productId, 'price' => '1499.00']);
        $this->assertDatabaseCount('price_histories', 2);
    }

    public function test_manual_liverpool_price_increase_is_reported_and_target_is_preserved(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Manual price test',
            'store' => 'Liverpool',
            'url' => 'https://www.liverpool.com.mx/tienda/pdp/producto/1234567890',
            'current_price' => '1499.00',
            'currency' => 'MXN',
            'target_price' => '1400.00',
        ])->assertCreated();
        $productId = $creation->json('data.id');

        $this->postJson("/api/products/{$productId}/manual-price", ['price' => '1599.00'])
            ->assertOk()
            ->assertJsonPath('data.direction', 'up')
            ->assertJsonPath('data.reached_target', false)
            ->assertJsonPath('data.product.target_price', '1400.00');

        $this->assertDatabaseCount('price_histories', 2);
    }

    public function test_manual_liverpool_price_that_is_unchanged_adds_no_history_point(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Manual price test',
            'store' => 'Liverpool',
            'url' => 'https://www.liverpool.com.mx/tienda/pdp/producto/1234567890',
            'current_price' => '1599.00',
            'currency' => 'MXN',
        ])->assertCreated();
        $productId = $creation->json('data.id');

        $this->postJson("/api/products/{$productId}/manual-price", ['price' => '1599.00'])
            ->assertOk()
            ->assertJsonPath('message', 'El precio sigue igual. No se agregó un punto al historial.')
            ->assertJsonPath('data.direction', 'unchanged')
            ->assertJsonPath('data.changed', false)
            ->assertJsonPath('data.recorded_at', null);

        $this->assertDatabaseCount('price_histories', 1);
    }

    public function test_manual_price_requires_positive_amount_and_liverpool_mxn_product(): void
    {
        $liverpool = $this->postJson('/api/products', [
            'name' => 'Manual price test',
            'store' => 'Liverpool',
            'url' => 'https://www.liverpool.com.mx/tienda/pdp/producto/1234567890',
            'current_price' => '1599.00',
            'currency' => 'MXN',
        ])->assertCreated()->json('data.id');
        $foreignCurrency = $this->user->products()->create([
            'name' => 'Legacy GBP Liverpool record',
            'store' => 'Liverpool',
            'url' => 'https://www.liverpool.com.mx/tienda/pdp/producto/1234567891',
            'current_price' => '51.77',
            'currency' => 'GBP',
        ]);
        $foreignCurrency->priceHistories()->create(['price' => '51.77', 'recorded_at' => now()]);

        $this->postJson("/api/products/{$liverpool}/manual-price", ['price' => 0])
            ->assertUnprocessable()->assertJsonValidationErrors('price');
        $this->postJson("/api/products/{$foreignCurrency->id}/manual-price", ['price' => 60])
            ->assertUnprocessable();

        $this->assertDatabaseCount('price_histories', 2);
        $this->assertDatabaseHas('products', ['id' => $foreignCurrency->id, 'current_price' => '51.77', 'currency' => 'GBP']);
    }

    public function test_manual_price_updates_mxn_products_from_other_stores(): void
    {
        $productId = $this->postJson('/api/products', [
            'name' => 'Coppel product',
            'store' => 'Coppel',
            'url' => 'https://www.coppel.com/producto',
            'current_price' => '900.00',
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/products/{$productId}/manual-price", ['price' => '850.00'])
            ->assertOk()
            ->assertJsonPath('data.current_price', '850.00')
            ->assertJsonPath('data.direction', 'down');

        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'store' => 'Coppel',
            'current_price' => '850.00',
        ]);
        $this->assertDatabaseHas('price_histories', [
            'product_id' => $productId,
            'price' => '850.00',
        ]);
    }

    public function test_duplicate_manual_price_requests_do_not_add_duplicate_history(): void
    {
        $productId = $this->postJson('/api/products', [
            'name' => 'Manual price test',
            'store' => 'Liverpool',
            'url' => 'https://www.liverpool.com.mx/tienda/pdp/producto/1234567890',
            'current_price' => '1599.00',
            'currency' => 'MXN',
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/products/{$productId}/manual-price", ['price' => '1499.00'])->assertOk()
            ->assertJsonPath('data.direction', 'down');
        $this->postJson("/api/products/{$productId}/manual-price", ['price' => '1499.00'])->assertOk()
            ->assertJsonPath('data.direction', 'unchanged');

        $this->assertDatabaseCount('price_histories', 2);
    }

    public function test_variant_can_be_updated_to_one_selection_without_changing_sku_or_url(): void
    {
        $product = $this->user->products()->create([
            'name' => 'Variant test',
            'store' => 'Liverpool',
            'url' => 'https://www.liverpool.com.mx/tienda/pdp/producto/1234567890?skuid=1234567891&size=King',
            'current_price' => '1599.00',
            'currency' => 'MXN',
            'variant_name' => 'Individual, Matrimonial, Queen o King, según elijas',
            'sku' => '1234567891',
        ]);
        $productId = $product->id;

        $this->patchJson("/api/products/{$productId}/variant", ['variant_name' => 'Individual'])
            ->assertOk()
            ->assertJsonPath('data.variant_name', 'Individual')
            ->assertJsonPath('data.url', 'https://www.liverpool.com.mx/tienda/pdp/producto/1234567890?skuid=1234567891&size=King')
            ->assertJsonPath('data.sku', '1234567891');

        $this->patchJson("/api/products/{$productId}/variant", ['variant_name' => 'Individual, Queen'])
            ->assertUnprocessable()->assertJsonValidationErrors('variant_name');
        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'variant_name' => 'Individual',
            'sku' => '1234567891',
        ]);
    }

    public function test_new_products_reject_non_mxn_currency_without_saving(): void
    {
        foreach (['GBP', 'USD', 'EUR'] as $currency) {
            $this->postJson('/api/products', [
                'name' => 'Test product',
                'store' => 'Test shop',
                'url' => 'https://example.com/product',
                'current_price' => 51.77,
                'currency' => $currency,
            ])->assertUnprocessable()
                ->assertJsonValidationErrors('currency');
        }

        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('price_histories', 0);
    }

    public function test_new_products_reject_books_to_scrape_demo_source_even_when_currency_is_mxn(): void
    {
        $this->postJson('/api/products', [
            'name' => 'A Light in the Attic',
            'store' => 'Books to Scrape',
            'url' => 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
            'current_price' => 51.77,
            'currency' => 'MXN',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('url');

        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('price_histories', 0);
    }

    public function test_existing_non_mxn_products_are_returned_with_original_currency_and_values(): void
    {
        $product = $this->user->products()->create([
            'name' => 'Legacy GBP product',
            'store' => 'Legacy source',
            'url' => 'https://example.com/legacy-product',
            'current_price' => '51.77',
            'currency' => 'GBP',
            'target_price' => '40.00',
        ]);
        $product->priceHistories()->create([
            'price' => '51.77',
            'recorded_at' => '2026-10-17 12:00:00',
        ]);

        $this->getJson('/api/products')->assertOk()
            ->assertJsonPath('data.0.currency', 'GBP')
            ->assertJsonPath('data.0.current_price', '51.77')
            ->assertJsonPath('data.0.target_price', '40.00')
            ->assertJsonPath('data.0.price_histories.0.price', '51.77');

        $this->assertDatabaseCount('products', 1);
        $this->assertDatabaseCount('price_histories', 1);
    }

    public function test_cors_preflight_allows_local_vite_origins(): void
    {
        foreach (['http://localhost:5173', 'http://127.0.0.1:5173'] as $origin) {
            $this->withHeaders([
                'Origin' => $origin,
                'Access-Control-Request-Method' => 'GET',
            ])->options('/api/products')
                ->assertNoContent()
                ->assertHeader('Access-Control-Allow-Origin', $origin)
                ->assertHeader('Access-Control-Allow-Credentials', 'true');
        }
    }

    public function test_cors_preflight_allows_native_android_mobile_auth(): void
    {
        $this->withHeaders([
            'Origin' => 'https://localhost',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'authorization,content-type',
        ])->options('/api/auth/mobile-login')
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'https://localhost')
            ->assertHeader('Access-Control-Allow-Credentials', 'true')
            ->assertHeader('Access-Control-Allow-Methods', 'POST')
            ->assertHeader('Access-Control-Allow-Headers', 'authorization,content-type');
    }

    public function test_products_can_be_listed_retrieved_and_deleted(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Audífonos',
            'store' => 'Tienda de prueba',
            'url' => 'https://example.com/product',
            'current_price' => 1299,
        ])->assertCreated();

        $productId = $creation->json('data.id');

        $this->getJson('/api/products')->assertOk()
            ->assertJsonPath('data.0.id', $productId);
        $this->getJson("/api/products/{$productId}")->assertOk()
            ->assertJsonPath('data.id', $productId);

        $this->deleteJson("/api/products/{$productId}")->assertOk()
            ->assertJsonPath('message', 'Producto eliminado correctamente.');

        $this->assertDatabaseMissing('products', ['id' => $productId]);
        $this->assertDatabaseMissing('price_histories', ['product_id' => $productId]);
    }

    public function test_product_metadata_can_be_edited_without_changing_history_or_owner(): void
    {
        $productId = $this->postJson('/api/products', [
            'name' => 'Old name',
            'store' => 'Coppel',
            'url' => 'https://www.coppel.com/producto',
            'current_price' => 1299,
        ])->assertCreated()->json('data.id');

        $this->patchJson("/api/products/{$productId}", [
            'name' => 'Updated name',
            'store' => 'Coppel',
            'url' => 'https://www.coppel.com/producto-actualizado',
            'sku' => 'CP-100',
            'variant_name' => 'Azul',
            'image' => null,
        ])->assertOk()
            ->assertJsonPath('data.name', 'Updated name')
            ->assertJsonPath('data.url', 'https://www.coppel.com/producto-actualizado')
            ->assertJsonPath('data.variant_name', 'Azul');

        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'user_id' => $this->user->id,
            'name' => 'Updated name',
            'current_price' => '1299.00',
        ]);
        $this->assertDatabaseCount('price_histories', 1);
    }

    public function test_product_lookup_extracts_demo_data_without_saving_a_product(): void
    {
        $html = <<<'HTML'
        <html><body><div class="product_main">
            <h1>A Light in the Attic</h1>
            <p class="price_color">£51.77</p>
        </div><div class="item active">
            <img src="../../media/cache/2c/da/2cdad67c44b002e7ead0cc35693c0e5b.jpg" />
        </div></body></html>
        HTML;

        $this->mock(PublicIpv4Resolver::class, function ($mock) {
            $mock->shouldReceive('resolve')->once()->with('books.toscrape.com')->andReturn('93.184.216.34');
        });
        Http::fake([
            'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html' => Http::response($html),
        ]);

        $this->withHeader('Origin', 'http://localhost:5173')->postJson('/api/products/lookup', [
            'url' => 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
        ])->assertOk()
            ->assertJsonPath('data.name', 'A Light in the Attic')
            ->assertJsonPath('data.current_price', '51.77')
            ->assertJsonPath('data.currency', 'GBP')
            ->assertJsonPath('data.image', 'https://books.toscrape.com/media/cache/2c/da/2cdad67c44b002e7ead0cc35693c0e5b.jpg')
            ->assertJsonPath('data.is_demo', true)
            ->assertJsonPath('data.html', $html)
            ->assertJsonPath('data.html_truncated', false);

        Http::assertSentCount(1);
        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('price_histories', 0);
    }

    public function test_requiem_red_lookup_returns_a_nonempty_current_price_and_image(): void
    {
        $html = <<<'HTML'
        <html><body><div class="product_main">
            <h1>The Requiem Red</h1>
            <p class="price_color">£22.65</p>
        </div><div class="item active">
            <img src="../../media/cache/0d/0a/0d0a7c2c6a4bff1b0c9f.jpeg" />
        </div></body></html>
        HTML;
        $this->mock(PublicIpv4Resolver::class, function ($mock) {
            $mock->shouldReceive('resolve')->once()->with('books.toscrape.com')->andReturn('93.184.216.34');
        });
        Http::fake([
            'https://books.toscrape.com/catalogue/the-requiem-red_995/index.html' => Http::response($html),
        ]);

        $response = $this->postJson('/api/products/lookup', [
            'url' => 'https://books.toscrape.com/catalogue/the-requiem-red_995/index.html',
        ])->assertOk()
            ->assertJsonPath('data.name', 'The Requiem Red')
            ->assertJsonPath('data.current_price', '22.65')
            ->assertJsonPath('data.currency', 'GBP')
            ->assertJsonPath('data.image', 'https://books.toscrape.com/media/cache/0d/0a/0d0a7c2c6a4bff1b0c9f.jpeg');

        $price = $response->json('data.current_price');
        $this->assertNotNull($price);
        $this->assertNotSame('', $price);
        $this->assertGreaterThan(0, (float) $price);
        Http::assertSentCount(1);
    }

    public function test_product_lookup_does_not_expose_html_to_unauthenticated_users(): void
    {
        $this->app['auth']->guard('web')->logout();
        $this->app['auth']->forgetGuards();
        $this->mock(BooksToScrapeLookupService::class, function ($mock) {
            $mock->shouldReceive('lookup')->once()->andReturn([
                'name' => 'A Light in the Attic',
                'html' => '<html>private response</html>',
                'html_truncated' => false,
            ]);
        });

        $this->postJson('/api/products/lookup', [
            'url' => 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
        ])->assertOk()
            ->assertJsonPath('data.name', 'A Light in the Attic')
            ->assertJsonMissingPath('data.html')
            ->assertJsonMissingPath('data.html_truncated');
    }

    public function test_product_lookup_limits_the_html_response_size(): void
    {
        $html = '<html><body><div class="product_main"><h1>A book</h1><p class="price_color">£51.77</p></div><p>'
            .str_repeat('a', 262_200)
            .'</p></body></html>';

        $this->mock(PublicIpv4Resolver::class, function ($mock) {
            $mock->shouldReceive('resolve')->once()->with('books.toscrape.com')->andReturn('93.184.216.34');
        });
        Http::fake([
            'https://books.toscrape.com/catalogue/a-book_1/index.html' => Http::response($html),
        ]);

        $response = $this->postJson('/api/products/lookup', [
            'url' => 'https://books.toscrape.com/catalogue/a-book_1/index.html',
        ])->assertOk()
            ->assertJsonPath('data.html_truncated', true);

        $this->assertLessThanOrEqual(262_144, strlen($response->json('data.html')));
        $this->assertStringStartsWith('<html>', $response->json('data.html'));
        Http::assertSentCount(1);
    }

    public function test_product_lookup_rejects_urls_outside_the_exact_demo_product_host(): void
    {
        $resolver = Mockery::mock(PublicIpv4Resolver::class);
        $resolver->shouldNotReceive('resolve');
        $this->app->instance(PublicIpv4Resolver::class, $resolver);

        $this->postJson('/api/products/lookup', [
            'url' => 'https://books.toscrape.com.evil.example/catalogue/a-book_1/index.html',
        ])->assertUnprocessable();

        $this->postJson('/api/products/lookup', [
            'url' => 'https://books.toscrape.com/catalogue/a-book_1/index.html?next=http://127.0.0.1',
        ])->assertUnprocessable();
    }

    public function test_product_lookup_does_not_follow_redirects(): void
    {
        $this->mock(PublicIpv4Resolver::class, function ($mock) {
            $mock->shouldReceive('resolve')->once()->andReturn('93.184.216.34');
        });
        Http::fake([
            'https://books.toscrape.com/catalogue/a-book_1/index.html' => Http::response('', 302, [
                'Location' => 'http://127.0.0.1/admin',
            ]),
        ]);

        $this->postJson('/api/products/lookup', [
            'url' => 'https://books.toscrape.com/catalogue/a-book_1/index.html',
        ])->assertStatus(502)
            ->assertJsonPath('message', 'El sitio respondió con una redirección y no se siguió por seguridad.');

        Http::assertSentCount(1);
        $this->assertDatabaseCount('products', 0);
    }

    public function test_product_lookup_rejects_a_private_resolved_address(): void
    {
        $this->mock(PublicIpv4Resolver::class, function ($mock) {
            $mock->shouldReceive('resolve')->once()->andReturn('127.0.0.1');
        });

        $this->postJson('/api/products/lookup', [
            'url' => 'https://books.toscrape.com/catalogue/a-book_1/index.html',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'La dirección del sitio no es segura para consultar.');

        Http::assertNothingSent();
        $this->assertDatabaseCount('products', 0);
    }

    public function test_product_lookup_reports_unclear_product_data_without_saving(): void
    {
        $this->mock(PublicIpv4Resolver::class, function ($mock) {
            $mock->shouldReceive('resolve')->once()->andReturn('93.184.216.34');
        });
        Http::fake([
            'https://books.toscrape.com/catalogue/a-book_1/index.html' => Http::response(
                '<html><body><h1>Book without a recognized price</h1></body></html>'
            ),
        ]);

        $this->postJson('/api/products/lookup', [
            'url' => 'https://books.toscrape.com/catalogue/a-book_1/index.html',
        ])->assertStatus(502)
            ->assertJsonPath('message', 'No se encontró un nombre y un precio claros en la página. Puedes completar los datos manualmente.');

        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('price_histories', 0);
    }

    public function test_amazon_mexico_lookup_extracts_current_offer_not_previous_price(): void
    {
        $html = <<<'HTML'
        <html><head><meta property="og:title" content="Producto Amazon">
            <meta property="og:image" content="https://m.media-amazon.com/images/I/test.jpg"></head>
        <body><span id="productTitle">Producto Amazon</span>
            <div id="corePrice_feature_div"><span class="a-offscreen">MX$ 1,234.50</span></div>
            <span id="listPrice" class="a-offscreen">$ 1,999.00</span>
            <div id="availability"><span>En existencia</span></div>
        </body></html>
        HTML;
        $this->mock(PublicIpv4Resolver::class, function ($mock) {
            $mock->shouldReceive('resolve')->once()->with('www.amazon.com.mx')->andReturn('93.184.216.34');
        });
        Http::fake([
            'https://www.amazon.com.mx/dp/B0ABCDEF12' => Http::response($html),
        ]);

        $this->postJson('/api/products/lookup', [
            'url' => 'https://www.amazon.com.mx/dp/B0ABCDEF12',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Producto Amazon')
            ->assertJsonPath('data.current_price', '1234.50')
            ->assertJsonPath('data.currency', 'MXN')
            ->assertJsonPath('data.image', 'https://m.media-amazon.com/images/I/test.jpg')
            ->assertJsonPath('data.availability', 'En existencia');

        Http::assertSentCount(1);
        $this->assertDatabaseCount('products', 0);
    }

    public function test_product_lookup_does_not_fetch_amazon_us_or_other_sites(): void
    {
        $resolver = Mockery::mock(PublicIpv4Resolver::class);
        $resolver->shouldNotReceive('resolve');
        $this->app->instance(PublicIpv4Resolver::class, $resolver);

        foreach ([
            'https://www.amazon.com/dp/B0ABCDEF12',
            'https://amazon.com.mx.evil.example/dp/B0ABCDEF12',
        ] as $url) {
            $this->postJson('/api/products/lookup', ['url' => $url])
                ->assertUnprocessable()
                ->assertJsonPath('message', 'Por ahora solo se consultan Books to Scrape y Amazon México.');
        }

        Http::assertNothingSent();
    }

    public function test_amazon_lookup_reports_blocked_pages_without_bypassing_them(): void
    {
        $this->mock(PublicIpv4Resolver::class, function ($mock) {
            $mock->shouldReceive('resolve')->once()->with('www.amazon.com.mx')->andReturn('93.184.216.34');
        });
        Http::fake([
            'https://www.amazon.com.mx/dp/B0ABCDEF12' => Http::response('Robot Check', 503),
        ]);

        $this->postJson('/api/products/lookup', [
            'url' => 'https://www.amazon.com.mx/dp/B0ABCDEF12',
        ])->assertStatus(502)
            ->assertJsonPath('message', 'Amazon no permitió acceder a la página del producto. No se obtuvo un precio.');

        Http::assertSentCount(1);
    }

    public function test_amazon_lookup_does_not_try_to_bypass_a_captcha_page(): void
    {
        $this->mock(PublicIpv4Resolver::class, function ($mock) {
            $mock->shouldReceive('resolve')->once()->with('www.amazon.com.mx')->andReturn('93.184.216.34');
        });
        Http::fake([
            'https://www.amazon.com.mx/dp/B0ABCDEF12' => Http::response(
                '<html><body>Robot Check: CAPTCHA</body></html>'
            ),
        ]);

        $this->postJson('/api/products/lookup', [
            'url' => 'https://www.amazon.com.mx/dp/B0ABCDEF12',
        ])->assertStatus(502)
            ->assertJsonPath('message', 'Amazon mostró una página de verificación. No se intentó evadirla y no se obtuvo un precio.');

        Http::assertSentCount(1);
    }

    public function test_amazon_lookup_does_not_use_previous_price_as_current_price(): void
    {
        $html = '<html><body><span id="productTitle">Producto sin oferta actual</span>'
            .'<span id="listPrice" class="a-offscreen">$ 1,999.00</span>'
            .'<span id="basisPrice" class="a-offscreen">$ 1,999.00</span></body></html>';
        $this->mock(PublicIpv4Resolver::class, function ($mock) {
            $mock->shouldReceive('resolve')->once()->with('www.amazon.com.mx')->andReturn('93.184.216.34');
        });
        Http::fake([
            'https://www.amazon.com.mx/dp/B0ABCDEF12' => Http::response($html),
        ]);

        $this->postJson('/api/products/lookup', [
            'url' => 'https://www.amazon.com.mx/dp/B0ABCDEF12',
        ])->assertStatus(502)
            ->assertJsonPath('message', 'Amazon no proporcionó un precio de venta actual accesible. No se usó el precio anterior, envío ni una mensualidad.');
    }

    public function test_product_history_is_returned_in_recorded_order(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Book',
            'store' => 'Books to Scrape',
            'url' => 'https://example.com/a-book',
            'current_price' => 51.77,
        ])->assertCreated();

        $product = Product::findOrFail($creation->json('data.id'));
        $product->priceHistories()->createMany([
            ['price' => 45.00, 'recorded_at' => '2026-10-16 12:00:00'],
            ['price' => 48.00, 'recorded_at' => '2026-10-15 12:00:00'],
        ]);

        $this->getJson("/api/products/{$product->id}/history")->assertOk()
            ->assertJsonPath('data.0.price', '48.00')
            ->assertJsonPath('data.1.price', '45.00')
            ->assertJsonPath('data.2.price', '51.77');
    }

    public function test_product_target_can_be_saved_removed_and_checked_against_current_price(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Book',
            'store' => 'Books to Scrape',
            'url' => 'https://example.com/a-book',
            'current_price' => 50.00,
        ])->assertCreated();
        $productId = $creation->json('data.id');

        $this->patchJson("/api/products/{$productId}/target", ['target_price' => 50])
            ->assertOk()
            ->assertJsonPath('data.target_price', '50.00')
            ->assertJsonPath('reached_target', true);

        $this->patchJson("/api/products/{$productId}/target", ['target_price' => null])
            ->assertOk()
            ->assertJsonPath('data.target_price', null)
            ->assertJsonPath('reached_target', false);

        $this->patchJson("/api/products/{$productId}/target", ['target_price' => -1])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('target_price');
        $this->assertDatabaseCount('price_histories', 1);
    }

    public function test_refresh_updates_a_changed_price_and_history_atomically_and_reports_target(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Book',
            'store' => 'Books to Scrape',
            'url' => 'https://example.com/a-book',
            'current_price' => 55.00,
            'target_price' => 50.00,
        ])->assertCreated();
        $productId = $creation->json('data.id');

        $this->mock(BooksToScrapeLookupService::class, function ($mock) {
            $mock->shouldReceive('lookup')->once()->with('https://example.com/a-book')
                ->andReturn(['current_price' => '45.00']);
        });

        $this->postJson("/api/products/{$productId}/refresh")->assertOk()
            ->assertJsonPath('data.direction', 'down')
            ->assertJsonPath('data.changed', true)
            ->assertJsonPath('data.reached_target', true)
            ->assertJsonPath('data.product.current_price', '45.00')
            ->assertJsonPath('data.product.target_price', '50.00');

        $this->assertDatabaseHas('products', ['id' => $productId, 'current_price' => '45.00', 'target_price' => '50.00']);
        $this->assertDatabaseCount('price_histories', 2);
        $this->assertDatabaseHas('price_histories', ['product_id' => $productId, 'price' => '45.00']);
    }

    public function test_refresh_without_a_price_change_does_not_add_a_history_point(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Book',
            'store' => 'Books to Scrape',
            'url' => 'https://example.com/a-book',
            'current_price' => 51.77,
        ])->assertCreated();
        $productId = $creation->json('data.id');

        $this->mock(BooksToScrapeLookupService::class, function ($mock) {
            $mock->shouldReceive('lookup')->once()->andReturn(['current_price' => '51.77']);
        });

        $this->postJson("/api/products/{$productId}/refresh")->assertOk()
            ->assertJsonPath('data.direction', 'unchanged')
            ->assertJsonPath('data.changed', false)
            ->assertJsonPath('message', 'El precio no cambió; el historial se conservó sin agregar un punto.');

        $this->assertDatabaseHas('products', ['id' => $productId, 'current_price' => '51.77']);
        $this->assertDatabaseCount('price_histories', 1);
    }

    public function test_refresh_reports_a_price_increase_without_overwriting_the_target(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Book',
            'store' => 'Books to Scrape',
            'url' => 'https://example.com/a-book',
            'current_price' => 51.77,
            'target_price' => 40,
        ])->assertCreated();
        $productId = $creation->json('data.id');

        $this->mock(BooksToScrapeLookupService::class, function ($mock) {
            $mock->shouldReceive('lookup')->once()->andReturn(['current_price' => '59.99']);
        });

        $this->postJson("/api/products/{$productId}/refresh")->assertOk()
            ->assertJsonPath('data.direction', 'up')
            ->assertJsonPath('data.changed', true)
            ->assertJsonPath('data.reached_target', false)
            ->assertJsonPath('data.product.current_price', '59.99')
            ->assertJsonPath('data.product.target_price', '40.00');

        $this->assertDatabaseCount('price_histories', 2);
    }

    public function test_refresh_failure_leaves_current_price_and_history_unchanged(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Book',
            'store' => 'Books to Scrape',
            'url' => 'https://example.com/a-book',
            'current_price' => 51.77,
        ])->assertCreated();
        $productId = $creation->json('data.id');

        $this->mock(BooksToScrapeLookupService::class, function ($mock) {
            $mock->shouldReceive('lookup')->once()
                ->andThrow(new ProductLookupException('La consulta falló.', 502));
        });

        $this->postJson("/api/products/{$productId}/refresh")->assertStatus(502)
            ->assertJsonPath('message', 'La consulta falló.');

        $this->assertDatabaseHas('products', ['id' => $productId, 'current_price' => '51.77']);
        $this->assertDatabaseCount('price_histories', 1);
    }

    public function test_refresh_rejects_unsupported_existing_product_source_without_changing_price(): void
    {
        $creation = $this->postJson('/api/products', [
            'name' => 'Other product',
            'store' => 'Other shop',
            'url' => 'https://example.com/product',
            'current_price' => 123.45,
        ])->assertCreated();
        $productId = $creation->json('data.id');

        $this->postJson("/api/products/{$productId}/refresh")->assertUnprocessable();
        $this->assertDatabaseHas('products', ['id' => $productId, 'current_price' => '123.45']);
        $this->assertDatabaseCount('price_histories', 1);
    }
}
