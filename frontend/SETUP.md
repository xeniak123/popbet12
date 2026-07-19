# PopBet — uruchomienie z GitHuba

## Co potrzebujesz

- Node 18+
- Yarn 1.x (albo npm — projekt używa yarn, ale `npx expo start` też zadziała)
- Konto Emergent z zdeployowanym backendem PopBet (albo lokalny FastAPI+MongoDB, patrz niżej)

## Krok po kroku (używając zdeployowanego backendu z Emergent)

1. **Sklonuj repo i zainstaluj zależności**
   ```bash
   git clone <twoje-repo>
   cd frontend
   yarn install     # lub `npm install`
   ```

2. **Utwórz plik `.env`**
   ```bash
   cp .env.example .env
   ```
   Edytuj `.env` i ustaw:
   ```
   EXPO_PUBLIC_BACKEND_URL=https://<twój-slug>.emergent.host
   ```
   (Adres znajdziesz w panelu Deployments w Emergent, po kliknięciu Publish.)

   Jeśli chcesz testować przeciwko preview (bez deploya):
   ```
   EXPO_PUBLIC_BACKEND_URL=https://<twój-slug>.preview.emergentagent.com
   ```

3. **Uruchom Expo**
   ```bash
   npx expo start
   ```
   Zeskanuj QR w Expo Go albo naciśnij `i` (iOS symulator) / `a` (Android).

## Znane ograniczenia

- **Push notifications** działają dopiero po wygenerowaniu natywnego builda (Emergent → Publish → Build). W Expo Go SDK 53+ push nie działa.
- **Kontakty i galeria** wymagają uprawnień systemowych na urządzeniu — zadziałają w Expo Go po zatwierdzeniu popupu.
- **Reset hasła** w wersji release'owej wysyła token w odpowiedzi API (tryb `in_app`). Podłącz SendGrid/Resend przed publikacją, jeśli chcesz maile.

## Uruchomienie własnego backendu (opcjonalne)

Jeśli chcesz mieć **cały stack** lokalnie:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export MONGO_URL="mongodb://localhost:27017"
export DB_NAME="popbet_dev"
export JWT_SECRET="dev-secret"
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

W `.env` frontendu ustaw:
```
EXPO_PUBLIC_BACKEND_URL=http://<twoje-ip-lokalne>:8001
```
(Uwaga: `http://localhost:8001` **nie** zadziała z Expo Go na fizycznym telefonie — telefon musi widzieć IP komputera w LAN.)

## Częste błędy

- **"Network request failed"** → brak pliku `.env` albo `EXPO_PUBLIC_BACKEND_URL` nieustawiony. Uruchom apkę — ekran startowy pokaże jaki jest problem.
- **"Missing bearer token"** → wylogowałeś się i wrócił krótko widok tabsów, zaraz przekieruje. Nic nie robić.
- **Google login pokazuje inne branding** → w tej wersji przycisk Google został usunięty; używaj email+hasło.
