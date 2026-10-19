#!/bin/sh
set -eu

if [ -z "${APP_KEY:-}" ]; then
    echo "APP_KEY is required." >&2
    exit 1
fi

case "${PORT:-10000}" in
    ''|*[!0-9]*)
        echo "PORT must be a numeric port." >&2
        exit 1
        ;;
esac

sed -ri "s/Listen 80/Listen ${PORT:-10000}/" /etc/apache2/ports.conf
sed -ri "s/:80>/:${PORT:-10000}>/" /etc/apache2/sites-available/000-default.conf

mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache

php artisan config:cache

exec "$@"
