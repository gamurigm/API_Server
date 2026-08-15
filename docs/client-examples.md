# Ejemplos de clientes

Todos los ejemplos reutilizan el JWT RS256 que la aplicación ya obtuvo mediante su autenticación actual.

Variables usadas:

```text
GATEWAY_URL=https://gateway.example
TOKEN=<jwt-rs256>
PATH=/api/v1/gateway/market-data/v1/quotes/NVDA
```

El prefijo `/api/v1/gateway/market-data` sustituye la URL base real del proveedor. El sufijo `/v1/quotes/NVDA`, el método, el query y el JSON siguen siendo los de la API original. La respuesta conserva el status, el `Content-Type` y el cuerpo original; solo los errores creados por el propio gateway usan una envoltura `error`.

## curl

```bash
curl "$GATEWAY_URL$PATH?interval=1d" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"
```

## Python

```python
import requests

response = requests.get(
    f"{gateway_url}/api/v1/gateway/market-data/v1/quotes/NVDA",
    headers={"Authorization": f"Bearer {token}"},
    timeout=25,
)
print(response.status_code, response.json())
```

## JavaScript

```javascript
const response = await fetch(`${gatewayUrl}/api/v1/gateway/market-data/v1/quotes/NVDA`, {
  headers: { Authorization: `Bearer ${token}` },
});
const body = await response.json();
```

## C++ con libcurl

```cpp
curl_easy_setopt(curl, CURLOPT_URL,
  "https://gateway.example/api/v1/gateway/market-data/v1/quotes/NVDA");
struct curl_slist* headers = nullptr;
headers = curl_slist_append(headers, ("Authorization: Bearer " + token).c_str());
curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
curl_easy_perform(curl);
```

## C#

```csharp
using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
var response = await client.GetAsync(
    $"{gatewayUrl}/api/v1/gateway/market-data/v1/quotes/NVDA");
var body = await response.Content.ReadAsStringAsync();
```

## Java

```java
var request = HttpRequest.newBuilder()
    .uri(URI.create(gatewayUrl + "/api/v1/gateway/market-data/v1/quotes/NVDA"))
    .header("Authorization", "Bearer " + token)
    .build();
var response = HttpClient.newHttpClient()
    .send(request, HttpResponse.BodyHandlers.ofString());
```

## Go

```go
request, _ := http.NewRequest("GET",
  gatewayURL+"/api/v1/gateway/market-data/v1/quotes/NVDA", nil)
request.Header.Set("Authorization", "Bearer "+token)
response, err := http.DefaultClient.Do(request)
```

## PowerShell

```powershell
Invoke-RestMethod `
  -Uri "$gatewayUrl/api/v1/gateway/market-data/v1/quotes/NVDA" `
  -Headers @{ Authorization = "Bearer $token" }
```

## SSE

El consumidor debe procesar `text/event-stream` incrementalmente. No espere a recibir el cuerpo completo. Si el consumidor cancela la conexión, el gateway cancela también la llamada upstream y libera su lease de concurrencia.
