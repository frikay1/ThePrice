<?php

namespace App\Http\Middleware;

use BadMethodCallException;
use Illuminate\Session\Middleware\AuthenticateSession;

class AuthenticateStatefulWebSession extends AuthenticateSession
{
    public function handle($request, \Closure $next)
    {
        $this->auth->shouldUse('web');

        return parent::handle($request, $next);
    }

    protected function guard()
    {
        return $this->auth->guard('web');
    }

    protected function storePasswordHashInSession($request)
    {
        if (! $request->user()) {
            return;
        }

        $passwordHash = $request->user()->getAuthPassword();

        try {
            $passwordHash = $this->guard()->hashPasswordForCookie($passwordHash);
        } catch (BadMethodCallException) {
        }

        $request->session()->put([
            'password_hash_web' => $passwordHash,
        ]);
    }
}
