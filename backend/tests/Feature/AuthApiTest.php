<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Illuminate\Auth\SessionGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withHeader('Origin', 'http://localhost:5173');
    }

    public function test_registration_stores_a_hashed_password(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Ana Pérez',
            'email' => 'ANA@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Ana Pérez')
            ->assertJsonPath('data.email', 'ana@example.com')
            ->assertJsonPath('data.products_count', 0);

        $user = User::where('email', 'ana@example.com')->firstOrFail();
        $this->assertTrue(Hash::check('password123', $user->password));
        $this->assertNotSame('password123', $user->password);
        $sessionCookie = $response->getCookie(config('session.cookie'));
        $this->assertNotNull($sessionCookie);
        $this->assertTrue($sessionCookie->isHttpOnly());
    }

    public function test_registration_rejects_case_insensitive_duplicate_email(): void
    {
        User::factory()->create(['email' => 'Ana@example.com']);

        $this->postJson('/api/auth/register', [
            'name' => 'Otra Ana',
            'email' => 'ana@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('email')
            ->assertJsonPath('errors.email.0', 'Este correo electrónico ya está registrado. Inicia sesión o utiliza otro correo.');
    }

    public function test_registration_rejects_mismatched_or_weak_passwords(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'Ana',
            'email' => 'ana@example.com',
            'password' => 'short',
            'password_confirmation' => 'different',
        ])->assertUnprocessable()->assertJsonValidationErrors(['password']);

        $this->assertDatabaseCount('users', 0);
    }

    public function test_login_is_case_insensitive(): void
    {
        $user = User::factory()->create(['email' => 'ana@example.com', 'password' => Hash::make('password123')]);

        $loginResponse = $this->postJson('/api/auth/login', [
            'email' => 'ANA@EXAMPLE.COM',
            'password' => 'password123',
        ])->assertOk()->assertJsonPath('data.id', $user->id);
        $sessionCookie = $loginResponse->getCookie(config('session.cookie'));
        $this->assertNotNull($sessionCookie);
        $this->assertTrue($sessionCookie->isHttpOnly());
    }

    public function test_mobile_login_uses_a_revocable_bearer_token_without_a_session_cookie(): void
    {
        config(['sanctum.stateful' => ['localhost:5173']]);
        $user = User::factory()->create([
            'email' => 'android@example.com',
            'password' => Hash::make('password123'),
        ]);

        $response = $this->withHeader('Origin', 'https://localhost')
            ->postJson('/api/auth/mobile-login', [
                'email' => 'ANDROID@example.com',
                'password' => 'password123',
            ])->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertHeader('Access-Control-Allow-Origin', 'https://localhost')
            ->assertHeader('Content-Type', 'application/json');

        $token = $response->json('token');
        $this->assertIsString($token);
        $this->assertNull($response->getCookie(config('session.cookie')));
        $this->assertDatabaseCount('personal_access_tokens', 1);

        $this->withHeaders(['Origin' => 'https://localhost'])
            ->withToken($token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);

        $this->withHeaders(['Origin' => 'https://localhost'])
            ->withToken($token)
            ->patchJson('/api/auth/password', [
                'current_password' => 'password123',
                'password' => 'newpass123',
                'password_confirmation' => 'newpass123',
            ])->assertOk();

        $this->withHeaders(['Origin' => 'https://localhost'])
            ->withToken($token)
            ->postJson('/api/auth/logout')
            ->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_mobile_login_validation_errors_keep_json_status_and_cors_headers(): void
    {
        $this->withHeaders([
            'Origin' => 'https://localhost',
            'Accept' => 'application/json',
        ])->postJson('/api/auth/mobile-login', [])
            ->assertUnprocessable()
            ->assertHeader('Content-Type', 'application/json')
            ->assertHeader('Access-Control-Allow-Origin', 'https://localhost')
            ->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_mobile_registration_returns_a_token_without_creating_a_web_session(): void
    {
        $response = $this->withHeader('Origin', 'https://localhost')
            ->postJson('/api/auth/mobile-register', [
                'name' => 'Android user',
                'email' => 'android@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
            ])->assertCreated()
            ->assertJsonPath('data.email', 'android@example.com');

        $this->assertIsString($response->json('token'));
        $this->assertNull($response->getCookie(config('session.cookie')));
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    public function test_authenticated_session_can_read_me_products_then_logout(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);
        $this->getJson('/api/products')->assertOk();
        $this->postJson('/api/auth/logout')->assertOk();

        $this->app['auth']->forgetGuards();
        $this->app->forgetInstance('session');
        $this->app->forgetInstance('session.store');
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_login_is_rate_limited_after_five_attempts(): void
    {
        User::factory()->create(['email' => 'ana@example.com', 'password' => Hash::make('password123')]);

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/auth/login', [
                'email' => 'ana@example.com',
                'password' => 'wrong-password',
            ])->assertUnauthorized();
        }

        $this->postJson('/api/auth/login', [
            'email' => 'ana@example.com',
            'password' => 'password123',
        ])->assertStatus(429);
    }

    public function test_authenticated_profile_can_update_name_and_password_after_checking_current_password(): void
    {
        $user = User::factory()->create(['password' => Hash::make('oldpass123')]);
        $this->actingAs($user);

        $this->getJson('/api/auth/me')->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.products_count', 0);

        $this->patchJson('/api/auth/profile', ['name' => 'Nombre actualizado'])->assertOk()
            ->assertJsonPath('data.name', 'Nombre actualizado');

        $this->patchJson('/api/auth/password', [
            'current_password' => 'incorrecta',
            'password' => 'newpass123',
            'password_confirmation' => 'newpass123',
        ])->assertUnprocessable()->assertJsonValidationErrors('current_password');

        $this->patchJson('/api/auth/password', [
            'current_password' => 'oldpass123',
            'password' => 'newpass123',
            'password_confirmation' => 'newpass123',
        ])->assertOk();

        $this->assertTrue(Hash::check('newpass123', $user->fresh()->password));
        $this->getJson('/api/products')->assertOk()->assertExactJson(['data' => []]);
        $this->postJson('/api/auth/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_logout_invalidates_the_current_session(): void
    {
        $this->actingAs(User::factory()->create());

        $this->postJson('/api/auth/logout')->assertOk()
            ->assertJsonPath('message', 'Sesión cerrada correctamente.');

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_logout_revokes_the_current_sanctum_personal_access_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('future-mobile')->plainTextToken;

        $this->withoutHeader('Origin')->withToken($token)
            ->postJson('/api/auth/logout')
            ->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->app['auth']->forgetGuards();
        $this->withoutHeader('Origin')->withToken($token)
            ->getJson('/api/auth/me')
            ->assertUnauthorized();
    }

    public function test_private_product_endpoints_require_authentication(): void
    {
        $this->getJson('/api/products')->assertUnauthorized();
        $this->postJson('/api/products', [])->assertUnauthorized();
    }

    public function test_api_auth_me_without_a_session_returns_json_401(): void
    {
        $this->get('/api/auth/me')
            ->assertUnauthorized()
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonPath('message', 'Unauthenticated.');
    }

    public function test_login_persists_the_authenticated_user_in_its_session_cookie_record(): void
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create([
            'email' => 'cookie-session@example.com',
            'password' => Hash::make('password123'),
        ]);

        $loginResponse = $this->postJson('/api/auth/login', [
            'email' => 'cookie-session@example.com',
            'password' => 'password123',
        ])->assertOk();

        $cookieName = config('session.cookie');
        $sessionCookie = $loginResponse->getCookie($cookieName);
        $this->assertNotNull($sessionCookie);
        $this->assertTrue($sessionCookie->isHttpOnly());
        $this->assertSame('/', $sessionCookie->getPath());
        $this->assertFalse($sessionCookie->isSecure());
        $this->assertSame('lax', $sessionCookie->getSameSite());
        $this->assertNull($sessionCookie->getDomain());
        $payload = DB::table('sessions')->where('id', $sessionCookie->getValue())->value('payload');
        $this->assertNotNull($payload);
        $attributes = unserialize(base64_decode($payload), ['allowed_classes' => false]);
        $this->assertSame(
            $user->id,
            $attributes['login_web_'.sha1(SessionGuard::class)]
        );
    }

    public function test_sanctum_csrf_cookie_is_available_to_configured_frontend_origins(): void
    {
        $response = $this->get('/sanctum/csrf-cookie');

        $response->assertNoContent()
            ->assertCookie('XSRF-TOKEN')
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
            ->assertHeader('Access-Control-Allow-Credentials', 'true');
    }

    public function test_product_data_and_mutations_are_isolated_between_users(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $product = $owner->products()->create([
            'name' => 'Producto privado',
            'store' => 'Liverpool',
            'url' => 'https://www.liverpool.com.mx/tienda/pdp/producto/1234567890',
            'current_price' => '1599.00',
            'currency' => 'MXN',
        ]);
        $product->priceHistories()->create(['price' => '1599.00', 'recorded_at' => now()]);

        $this->actingAs($otherUser);

        $this->getJson('/api/products')->assertOk()->assertExactJson(['data' => []]);
        $this->getJson("/api/products/{$product->id}")->assertNotFound();
        $this->getJson("/api/products/{$product->id}/history")->assertNotFound();
        $this->patchJson("/api/products/{$product->id}/target", ['target_price' => '1200'])->assertNotFound();
        $this->patchJson("/api/products/{$product->id}", [
            'name' => 'Attempted edit',
            'store' => 'Coppel',
            'url' => 'https://www.coppel.com/producto',
            'sku' => null,
            'variant_name' => null,
            'image' => null,
        ])->assertNotFound();
        $this->patchJson("/api/products/{$product->id}/variant", ['variant_name' => 'Individual'])->assertNotFound();
        $this->postJson("/api/products/{$product->id}/manual-price", ['price' => '1499'])->assertNotFound();
        $this->postJson("/api/products/{$product->id}/refresh")->assertNotFound();
        $this->deleteJson("/api/products/{$product->id}")->assertNotFound();

        $this->assertDatabaseHas('products', ['id' => $product->id, 'user_id' => $owner->id, 'current_price' => '1599.00']);
        $this->assertDatabaseCount('price_histories', 1);
    }

    public function test_legacy_products_without_an_owner_are_not_returned_or_mutable(): void
    {
        $legacyProduct = Product::create([
            'name' => 'Producto histórico sin propietario',
            'store' => 'Legacy',
            'url' => 'https://example.com/legacy',
            'current_price' => '51.77',
            'currency' => 'GBP',
        ]);
        $this->actingAs(User::factory()->create());

        $this->getJson('/api/products')->assertOk()->assertExactJson(['data' => []]);
        $this->getJson("/api/products/{$legacyProduct->id}")->assertNotFound();
        $this->deleteJson("/api/products/{$legacyProduct->id}")->assertNotFound();
        $this->assertDatabaseHas('products', ['id' => $legacyProduct->id, 'user_id' => null, 'current_price' => '51.77']);
    }
}
