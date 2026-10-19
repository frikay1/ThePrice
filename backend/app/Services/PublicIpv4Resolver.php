<?php

namespace App\Services;

class PublicIpv4Resolver
{
    public function resolve(string $host): string
    {
        $records = dns_get_record($host, DNS_A);
        $addresses = array_values(array_unique(array_column($records ?: [], 'ip')));

        if ($addresses === []) {
            throw new ProductLookupException('No fue posible verificar la dirección del sitio.', 502);
        }

        foreach ($addresses as $address) {
            if (! $this->isPublicAddress($address)) {
                throw new ProductLookupException('La dirección del sitio no es segura para consultar.', 422);
            }
        }

        return $addresses[0];
    }

    public function isPublicAddress(string $address): bool
    {
        return filter_var(
            $address,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) !== false;
    }
}
