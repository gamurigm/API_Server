# Ejemplos de clientes

Todos los ejemplos aceptan como `TOKEN` una clave de acceso del gateway (backends y scripts privados) o un JWT RS256 obtenido mediante la autenticación existente de la aplicación. En esta versión local, el consumidor debe correr en el mismo equipo que el gateway; el backend no acepta conexiones de red remotas.

Para usar una clave: registre su app, autorice los proveedores en **Accesos** y créela desde el TUI en **Claves de acceso** con los scopes requeridos. Copie su valor una sola vez y guárdelo como secreto en el entorno del backend. No necesita configurar issuer ni JWKS. Una clave revocada o vencida devuelve `401`; una app desactivada o un permiso insuficiente devuelve `403`; una cuota agotada devuelve `429`.

La clave nunca debe incrustarse en un frontend o una app móvil distribuida. En esos casos use un JWT temporal o llame a través de su backend. Para rotarla, cree una nueva y revoque la anterior después de actualizar el consumidor.

Variables usadas:

```text
GATEWAY_URL=http://127.0.0.1:43871
TOKEN=<clave-del-gateway-o-jwt-rs256>
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
  "http://127.0.0.1:43871/api/v1/gateway/market-data/v1/quotes/NVDA");
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
