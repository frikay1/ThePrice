<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $user = $this->createRegisteredUser($request);
        if ($user instanceof JsonResponse) {
            return $user;
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return response()->json([
            'message' => 'Cuenta creada correctamente.',
            'data' => $this->profileData($user),
        ], 201);
    }

    public function mobileRegister(Request $request): JsonResponse
    {
        $user = $this->createRegisteredUser($request);
        if ($user instanceof JsonResponse) {
            return $user;
        }

        return $this->issueMobileToken($user, 'Cuenta creada correctamente.', 201);
    }

    public function login(Request $request): JsonResponse
    {
        $user = $this->authenticateCredentials($request);
        if ($user instanceof JsonResponse) {
            return $user;
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return response()->json([
            'message' => 'Sesión iniciada correctamente.',
            'data' => $this->profileData($user),
        ]);
    }

    public function mobileLogin(Request $request): JsonResponse
    {
        $user = $this->authenticateCredentials($request);
        if ($user instanceof JsonResponse) {
            return $user;
        }

        return $this->issueMobileToken($user, 'Sesión iniciada correctamente.');
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->profileData($request->user()),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:255'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'El nombre no es válido.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $user = $request->user();
        $user->name = trim($validator->validated()['name']);
        $user->save();

        return response()->json([
            'message' => 'Nombre actualizado correctamente.',
            'data' => $this->profileData($user),
        ]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $user = $request->user();
        $usesPersonalAccessToken = $user->currentAccessToken() instanceof PersonalAccessToken;
        $validator = Validator::make($request->all(), [
            'current_password' => $usesPersonalAccessToken
                ? ['required', 'string']
                : ['required', 'current_password:web'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'No se pudo cambiar la contraseña.',
                'errors' => $validator->errors(),
            ], 422);
        }

        if ($usesPersonalAccessToken && ! Hash::check($validator->validated()['current_password'], $user->password)) {
            return response()->json([
                'message' => 'No se pudo cambiar la contraseña.',
                'errors' => ['current_password' => ['La contraseña actual no es correcta.']],
            ], 422);
        }

        $user->password = $validator->validated()['password'];
        $user->save();

        return response()->json([
            'message' => 'Contraseña actualizada correctamente.',
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()->currentAccessToken();
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        if ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'message' => 'Sesión cerrada correctamente.',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function profileData(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'created_at' => $user->created_at,
            'products_count' => $user->products()->count(),
        ];
    }

    private function ownershipMigrationPending(): ?JsonResponse
    {
        if (Schema::hasColumn('products', 'user_id')) {
            return null;
        }

        return response()->json([
            'message' => 'La asociación privada de productos aún no está habilitada. Aplica la migración incremental después de confirmar cómo vincular los productos existentes.',
        ], 503);
    }

    private function createRegisteredUser(Request $request): User|JsonResponse
    {
        if ($response = $this->ownershipMigrationPending()) {
            return $response;
        }

        $email = strtolower(trim((string) $request->input('email')));
        $validator = Validator::make([
            ...$request->all(),
            'email' => $email,
        ], [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email:rfc', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
        ], [
            'name.required' => 'Ingresa tu nombre completo.',
            'email.required' => 'Ingresa tu correo electrónico.',
            'email.email' => 'Ingresa un correo electrónico válido.',
            'email.unique' => 'Este correo electrónico ya está registrado. Inicia sesión o utiliza otro correo.',
            'password.required' => 'Ingresa una contraseña.',
            'password' => 'La contraseña debe tener al menos 8 caracteres y contener letras y números.',
            'password.confirmed' => 'Las contraseñas no coinciden.',
            'password.min' => 'La contraseña debe tener al menos 8 caracteres.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Revisa los datos del registro.',
                'errors' => $validator->errors(),
            ], 422);
        }

        if (User::query()->whereRaw('LOWER(email) = ?', [$email])->exists()) {
            return response()->json([
                'message' => 'Revisa los datos del registro.',
                'errors' => ['email' => ['Este correo electrónico ya está registrado. Inicia sesión o utiliza otro correo.']],
            ], 422);
        }

        return User::create([
            'name' => trim($validator->validated()['name']),
            'email' => $email,
            'password' => $validator->validated()['password'],
        ]);
    }

    private function authenticateCredentials(Request $request): User|JsonResponse
    {
        if ($response = $this->ownershipMigrationPending()) {
            return $response;
        }

        $email = strtolower(trim((string) $request->input('email')));
        $limiterKey = 'auth-login:'.sha1($email.'|'.$request->ip());
        if (RateLimiter::tooManyAttempts($limiterKey, 5)) {
            return response()->json([
                'message' => 'Demasiados intentos. Espera un minuto antes de volver a intentarlo.',
            ], 429)->header('Retry-After', (string) RateLimiter::availableIn($limiterKey));
        }
        RateLimiter::hit($limiterKey, 60);

        $validator = Validator::make([
            ...$request->all(),
            'email' => $email,
        ], [
            'email' => ['required', 'email:rfc', 'max:255'],
            'password' => ['required', 'string'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Ingresa un correo y contraseña válidos.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $user = User::query()->whereRaw('LOWER(email) = ?', [$email])->first();
        if (! $user || ! Hash::check($validator->validated()['password'], $user->password)) {
            return response()->json([
                'message' => 'El correo o la contraseña no son correctos.',
            ], 401);
        }

        return $user;
    }

    private function issueMobileToken(User $user, string $message, int $status = 200): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'token' => $user->createToken('the-price-android')->plainTextToken,
            'data' => $this->profileData($user),
        ], $status);
    }
}
