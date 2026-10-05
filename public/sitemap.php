<?php
/**
 * Sitemap com as páginas fixas e os perfis públicos ativos.
 *
 * O sitemap.xml estático só listava 5 URLs e nenhum compositor. O .htaccess
 * encaminha /sitemap.xml para cá; se o Supabase não responder, sai só a parte
 * fixa, e o sitemap.xml estático continua no build como reserva.
 */

header('Content-Type: application/xml; charset=UTF-8');
header('Cache-Control: public, max-age=3600');

$config = is_file(__DIR__ . '/og-config.php') ? require __DIR__ . '/og-config.php' : null;
$appUrl = rtrim((string) ($config['appUrl'] ?? ''), '/');
if ($appUrl === '') {
    $appUrl = 'https://mercadodocompositor.com.br';
}

$urls = [
    ['loc' => $appUrl . '/', 'changefreq' => 'daily', 'priority' => '1.0'],
    ['loc' => $appUrl . '/compositores', 'changefreq' => 'daily', 'priority' => '0.9'],
    ['loc' => $appUrl . '/validar-documento', 'changefreq' => 'monthly', 'priority' => '0.6'],
    ['loc' => $appUrl . '/termos', 'changefreq' => 'yearly', 'priority' => '0.4'],
    ['loc' => $appUrl . '/privacidade', 'changefreq' => 'yearly', 'priority' => '0.4'],
];

if (is_array($config) && !empty($config['supabaseUrl']) && !empty($config['anonKey'])) {
    foreach (mc_sitemap_composers($config['supabaseUrl'], $config['anonKey']) as $username) {
        $urls[] = ['loc' => $appUrl . '/compositor/' . rawurlencode($username), 'changefreq' => 'weekly', 'priority' => '0.8'];
    }
}

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($urls as $url) {
    echo '  <url><loc>' . htmlspecialchars($url['loc'], ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</loc>'
        . '<changefreq>' . $url['changefreq'] . '</changefreq>'
        . '<priority>' . $url['priority'] . '</priority></url>' . "\n";
}
echo '</urlset>' . "\n";

/** Usernames dos perfis públicos (assinatura ativa), pela RPC pública. */
function mc_sitemap_composers(string $supabaseUrl, string $anonKey): array
{
    $url = rtrim($supabaseUrl, '/') . '/rest/v1/rpc/get_public_composers';
    $body = json_encode(['p_limit' => 1000, 'p_search' => null, 'p_genre' => null]);
    $headers = ['Content-Type: application/json', 'apikey: ' . $anonKey, 'Authorization: Bearer ' . $anonKey];

    $response = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 6,
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($status !== 200) {
            return [];
        }
    }

    $data = is_string($response) ? json_decode($response, true) : null;
    if (!is_array($data)) {
        return [];
    }
    $usernames = [];
    foreach ($data as $item) {
        $username = is_array($item) ? (string) ($item['username'] ?? '') : '';
        if ($username !== 'mercado' && preg_match('/^[a-z0-9-]{1,60}$/', $username)) {
            $usernames[] = $username;
        }
    }
    return array_values(array_unique($usernames));
}
