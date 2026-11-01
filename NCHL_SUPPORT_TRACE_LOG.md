# NCHL NEPALPAY Dynamic QR — Live Gateway Trace Log

**Test Date & Time:** October 28, 2026, 17:51:33 NPT (12:06:33 GMT)  
**Whitelisted Client IP:** `160.250.255.215` (Active & Verified)  
**Target Gateway Endpoint:** `POST https://devopennpi.connectips.com/qr/generateQR`  
**Merchant ID (PAN):** `2501F6MCTZZ`  
**Acquirer ID:** `00002501`  
**Merchant Name:** Infinity Dental  
**MCC:** `8021` (Dentists / Orthodontists)  
**Basic Auth Username:** `infinitydentnqr`  
**User ID in TokenString:** `INFINITYDENTNQR@999`  

---

## 1. NCHL Dynamic QR Token Signature Specification (7 Fields with MCC 8021)

```text
TokenString = acquirerId + "," + merchantId + "," + merchantCategoryCode + "," + transactionCurrency + "," + transactionAmount + "," + billNumber + ",INFINITYDENTNQR@999"
```

### Exact Concatenated TokenString:
```text
"00002501,2501F6MCTZZ,8021,524,1500.00,TEST-1793188968099,INFINITYDENTNQR@999"
```

| Field # | Parameter Name | Value in Request |
|---|---|---|
| 1 | `acquirerId` | `00002501` |
| 2 | `merchantId` | `2501F6MCTZZ` |
| 3 | `merchantCategoryCode` | `8021` |
| 4 | `transactionCurrency` | `524` |
| 5 | `transactionAmount` | `1500.00` |
| 6 | `billNumber` | `TEST-1793188968099` |
| 7 | `userId` | `INFINITYDENTNQR@999` |

### Generated RSA-SHA256 Token (Base64)
Signed using client RSA private key from `certs/npi_key.pem`:
```text
JAGEyG6djDWKFDEMfOEx2Nk2hjcw0+esQEPM5bZyIfN7+GYH8GC/gkiMcyVxZtlJkySJXTd8SkR+N2I2YL5pLJ6pHTNUe303Hx7npsC3v+XPEuqVh4J1i9GOgRrpCkhse+UWNi41RKsqyLnSkrv9Q1ozwqZYWFu6w0/oXz7y4tc=
```

---

## 2. Basic Auth Header
- **Username:** `infinitydentnqr`
- **Masked Password:** `Ab****23`
- **Header:** `Authorization: Basic aW5maW5pdHlkZW50bnFyOkFiY2RAMTIz`

---

## 3. Full Outgoing Request JSON Payload
```json
{
  "pointOfInitialization": 12,
  "acquirerId": "00002501",
  "merchantId": "2501F6MCTZZ",
  "merchantName": "Infinity Dental",
  "merchantCategoryCode": 8021,
  "merchantCountry": "NP",
  "merchantCity": "Kathmandu",
  "merchantPostalCode": "4600",
  "merchantLanguage": "en",
  "transactionCurrency": 524,
  "transactionAmount": "1500.00",
  "valueOfConvenienceFeeFixed": "0.00",
  "billNumber": "TEST-1793188968099",
  "referenceLabel": "Dental Treatment",
  "mobileNo": "9800000000",
  "storeLabel": "Store1",
  "terminalLabel": "Terminal1",
  "purposeOfTransaction": "Dental Treatment",
  "additionalConsumerDataRequest": null,
  "loyaltyNumber": null,
  "token": "JAGEyG6djDWKFDEMfOEx2Nk2hjcw0+esQEPM5bZyIfN7+GYH8GC/gkiMcyVxZtlJkySJXTd8SkR+N2I2YL5pLJ6pHTNUe303Hx7npsC3v+XPEuqVh4J1i9GOgRrpCkhse+UWNi41RKsqyLnSkrv9Q1ozwqZYWFu6w0/oXz7y4tc="
}
```

---

## 4. Live Gateway Response Body
```json
{
  "responseCode": "E401",
  "responseMessage": "UNAUTHORIZED- Invalid Request!",
  "data": null,
  "classfielderrorlist": []
}
```
**HTTP Status:** `401 Unauthorized`  
**Headers:**
```json
{
  "server": "none",
  "date": "Wed, 28 Oct 2026 12:06:33 GMT",
  "content-type": "application/json",
  "transfer-encoding": "chunked",
  "connection": "keep-alive",
  "x-frame-options": "DENY"
}
```
