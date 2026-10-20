FROM php:8.3-apache

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public \
    COMPOSER_ALLOW_SUPERUSER=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libonig-dev libpq-dev unzip \
    && docker-php-ext-install mbstring opcache pdo_pgsql \
    && a2enmod headers rewrite \
    && sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf \
    && printf '<Directory "%s">\n    Options FollowSymLinks\n    AllowOverride All\n    Require all granted\n</Directory>\n' "$APACHE_DOCUMENT_ROOT" > /etc/apache2/conf-available/theprice-public.conf \
    && a2enconf theprice-public \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY . .
RUN composer install --no-dev --no-interaction --no-progress --prefer-dist --optimize-autoloader

COPY docker/entrypoint.sh /usr/local/bin/the-price-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/the-price-entrypoint \
    && chmod +x /usr/local/bin/the-price-entrypoint \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 10000
ENTRYPOINT ["the-price-entrypoint"]
CMD ["apache2-foreground"]
