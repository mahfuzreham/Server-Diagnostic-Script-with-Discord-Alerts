<?php
namespace ResellNomPortal;

final class MonitorClient {
    private string $baseUrl;
    private string $token;
    public function __construct(string $baseUrl, string $token) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->token = $token;
    }
    public function get(string $path): array {
        $ch = curl_init($this->baseUrl . '/' . ltrim($path, '/'));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer '.$this->token, 'Accept: application/json'],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        $body = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
        if ($body === false || $code >= 400) throw new \RuntimeException('Monitor API request failed'.($err ? ': '.$err : ''));
        $data = json_decode($body, true);
        if (!is_array($data)) throw new \RuntimeException('Invalid Monitor API response');
        return $data;
    }
}
