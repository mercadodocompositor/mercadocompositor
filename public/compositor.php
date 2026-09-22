<?php
/**
 * Perfil público com título e Open Graph próprios.
 *
 * WhatsApp, Facebook, LinkedIn e X não executam JavaScript: sem isto, todo link
 * /compositor/<username> mostrava a prévia genérica do site. O .htaccess encaminha
 * essas URLs para cá; o script busca o perfil na RPC pública get_public_composer,
 * injeta as meta tags no index.html do build e devolve a SPA normalmente.
 *
 * Qualquer falha (sem config, Supabase fora do ar, timeout) devolve o index.html
 * sem alteração: o perfil continua abrindo, só perde a prévia personalizada.
 * A configuração vem de og-config.php, gerado pelo build (vite.config.ts).
 */

header('Content-Type: text/html; charset=UTF-8');
// Igual ao index.html: o HTML referencia /assets/*.js com hash, que mudam a cada deploy.
header('Cache-Control: no-cache, no-store, must-revalidate');

$html = @file_get_contents(__DIR__ . '/index.html');
if ($html === false) {
    http_response_code(500);
    exit('Página indisponível no momento.');
}

$username = strtolower(trim((string) ($_GET['u'] ?? '')));
$songId = trim((string) ($_GET['musica'] ?? ''));
$config = is_file(__DIR__ . '/og-config.php') ? require __DIR__ . '/og-config.php' : null;

if (!preg_match('/^[a-z0-9-]{1,60}$/', $username) || !is_array($config)
    || empty($config['supabaseUrl']) || empty($config['anonKey'])) {
    echo $html;
    exit;
}

$result = mc_fetch_composer($config['supabaseUrl'], $config['anonKey'], $username);
if ($result['status'] !== 200) {
    echo $html;
    exit;
}

$appUrl = rtrim((string) ($config['appUrl'] ?? ''), '/');
if ($appUrl === '') {
    $appUrl = 'https://' . ($_SERVER['HTTP_HOST'] ?? 'mercadodocompositor.com.br');
}

$data = $result['data'];
if (!is_array($data) || empty($data['profile'])) {
    // Perfil inexistente ou sem assinatura ativa: 404 real para buscadores; a SPA mostra o aviso.
    http_response_code(404);
    echo mc_apply_meta($html, [
        'title' => 'Compositor não encontrado | Mercado do Compositor',
        'robots' => 'noindex',
    ]);
    exit;
}

$profile = $data['profile'];
$songs = is_array($data['songs'] ?? null) ? $data['songs'] : [];
$stageName = mc_text($profile['stageName'] ?? '') ?: 'Compositor';
$profileUrl = $appUrl . '/compositor/' . rawurlencode($username);
$profileImage = mc_first_image([$profile['photo'] ?? '', $profile['coverPhoto'] ?? '']);

$song = null;
if ($songId !== '') {
    foreach ($songs as $candidate) {
        if (($candidate['id'] ?? '') === $songId && ($candidate['status'] ?? '') === 'published') {
            $song = $candidate;
            break;
        }
    }
}

if ($song) {
    $title = mc_text($song['title'] ?? '');
    $authors = mc_text($song['authors'] ?? '') ?: $stageName;
    $genre = mc_text($song['genre'] ?? '');
    $meta = [
        'title' => $title . ' — ' . $stageName . ' | Mercado do Compositor',
        'description' => mc_summarize('Ouça a prévia de "' . $title . '", composição de ' . $authors
            . ($genre !== '' ? ' (' . $genre . ')' : '') . ', e solicite a liberação da obra no Mercado do Compositor.'),
        'url' => $profileUrl . '?musica=' . rawurlencode($songId),
        'image' => mc_first_image([$song['coverUrl'] ?? '']) ?: $profileImage,
        'type' => 'music.song',
    ];
} else {
    $genres = array_slice(array_filter(array_map('mc_text', (array) ($profile['genres'] ?? []))), 0, 3);
    $bio = mc_text($profile['bio'] ?? '');
    // Mesmo critério do getSafePublicBio: bios de teste ou curtas demais viram texto padrão.
    if (mb_strlen($bio) < 15 || preg_match('/teste de biografia|lorem ipsum|^(teste|test)\b/i', $bio)) {
        $count = count($songs);
        $bio = 'Ouça as prévias ' . ($count === 1 ? 'da obra' : 'das ' . $count . ' obras') . ' de ' . $stageName
            . ' e solicite a liberação para gravação no Mercado do Compositor.';
    }
    $meta = [
        'title' => $stageName . ' | Mercado do Compositor',
        'description' => mc_summarize(($genres ? implode(', ', $genres) . '. ' : '') . $bio),
        'url' => $profileUrl,
        'image' => $profileImage,
        'type' => 'profile',
    ];
}

echo mc_apply_meta($html, $meta);

/** Chama a RPC pública com timeout curto: a prévia nunca pode atrasar a abertura do perfil. */
function mc_fetch_composer(string $supabaseUrl, string $anonKey, string $username): array
{
    $url = rtrim($supabaseUrl, '/') . '/rest/v1/rpc/get_public_composer';
    $body = json_encode(['p_username' => $username]);
    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
        'apikey: ' . $anonKey,
        'Authorization: Bearer ' . $anonKey,
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 3,
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'content' => $body,
            'timeout' => 3,
            'ignore_errors' => true,
        ]]);
        $response = @file_get_contents($url, false, $context);
        $status = 0;
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
            $status = (int) $m[1];
        }
    }

    if ($response === false || $status !== 200) {
        return ['status' => $status ?: 502, 'data' => null];
    }
    return ['status' => 200, 'data' => json_decode((string) $response, true)];
}

function mc_text($value): string
{
    return is_string($value) ? trim(preg_replace('/\s+/u', ' ', strip_tags($value))) : '';
}

function mc_summarize(string $text, int $max = 155): string
{
    $text = mc_text($text);
    if (mb_strlen($text) <= $max) {
        return $text;
    }
    $cut = mb_substr($text, 0, $max - 1);
    $space = mb_strrpos($cut, ' ');
    if ($space !== false && $space > $max * 0.6) {
        $cut = mb_substr($cut, 0, $space);
    }
    return rtrim($cut, " .,;:!?-") . '…';
}

/** WhatsApp/Facebook só aceitam imagem absoluta e não aceitam SVG. */
function mc_first_image(array $candidates): string
{
    foreach ($candidates as $url) {
        if (is_string($url) && preg_match('#^https?://#i', $url) && !preg_match('#\.svg($|[?\#])#i', $url)) {
            return $url;
        }
    }
    return '';
}

function mc_apply_meta(string $html, array $meta): string
{
    $e = function (string $value): string {
        return htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    };

    if (!empty($meta['title'])) {
        $html = preg_replace_callback('#<title>.*?</title>#s', function () use ($meta, $e) {
            return '<title>' . $e($meta['title']) . '</title>';
        }, $html, 1);
    }

    $tags = [
        ['name', 'description', $meta['description'] ?? ''],
        ['property', 'og:type', $meta['type'] ?? ''],
        ['property', 'og:url', $meta['url'] ?? ''],
        ['property', 'og:title', $meta['title'] ?? ''],
        ['property', 'og:description', $meta['description'] ?? ''],
        ['property', 'og:image', $meta['image'] ?? ''],
        ['name', 'twitter:url', $meta['url'] ?? ''],
        ['name', 'twitter:title', $meta['title'] ?? ''],
        ['name', 'twitter:description', $meta['description'] ?? ''],
        ['name', 'twitter:image', $meta['image'] ?? ''],
    ];
    foreach ($tags as [$attr, $key, $value]) {
        if ($value === '') {
            continue;
        }
        $pattern = '#<meta\s+' . $attr . '="' . preg_quote($key, '#') . '"\s+content="[^"]*"\s*/?>#i';
        $html = preg_replace_callback($pattern, function () use ($attr, $key, $value, $e) {
            return '<meta ' . $attr . '="' . $key . '" content="' . $e($value) . '" />';
        }, $html, 1);
    }

    if (!empty($meta['url'])) {
        $html = preg_replace_callback('#<link\s+rel="canonical"\s+href="[^"]*"\s*/?>#i', function () use ($meta, $e) {
            return '<link rel="canonical" href="' . $e($meta['url']) . '" />';
        }, $html, 1);
    }

    if (!empty($meta['robots'])) {
        $html = preg_replace('#</head>#i', '  <meta name="robots" content="' . $e($meta['robots']) . '" />' . "\n  </head>", $html, 1);
    }

    return $html;
}
