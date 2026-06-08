// SmartHockey Billing Module (Digital Goods API + Payment Request API + Lizenzcode-System)
// Works inside a TWA (Trusted Web Activity) built via PWABuilder – no Capacitor needed.

const BILLING_GRACE_PERIOD_DAYS = 7;    // Offline-Toleranzzeitraum bevor erneute Prüfung nötig ist
const BILLING_PLAY_METHOD = 'https://play.google.com/billing';
const BILLING_PLAY_SERVICE = 'https://play.google.com/billing';

// Gültige Lizenzcodes – hier neue Codes eintragen um sie freizuschalten
const VALID_LICENSE_CODES = [
  'SMARTHOCKEY2024',
  'PRO-TEAM-55'
];

App.billing = {
  PRODUCT_ID: 'pro_yearly_subscription',
  isSubscribed: false,
  isTWA: false,
  _service: null,

  async init() {
    // 1. Zuerst prüfen, ob ein gültiger Lizenzcode hinterlegt ist
    if (this._checkLicenseCode()) {
      return;
    }

    // TWA-Kontext über Digital Goods API erkennen
    this.isTWA = (typeof window.getDigitalGoodsService === 'function');

    if (!this.isTWA) {
      // Browser / PWA: Zugriff ohne Paywall gewähren
      console.log('[Billing] Ausführung im Browser → Zugriff gewährt');
      this.isSubscribed = true;
      this._updateUI();
      return;
    }

    // TWA-Kontext: Verbindung zu Google Play Billing herstellen
    try {
      this._service = await window.getDigitalGoodsService(BILLING_PLAY_SERVICE);
      console.log('[Billing] Digital Goods Service verbunden');
    } catch (err) {
      console.warn('[Billing] Konnte nicht mit dem Digital Goods Service verbinden:', err);
      this._checkLocalCache();
      return;
    }

    await this._loadProductDetails();
    await this._checkEntitlements();
  },

  // -- LIZENZCODE-METHODEN --

  _checkLicenseCode() {
    const activeCode = localStorage.getItem('sPro_active_license_code');
    if (activeCode && VALID_LICENSE_CODES.includes(activeCode.toUpperCase())) {
      console.log('[Billing] Gültiger Lizenzcode gefunden → Zugriff gewährt');
      this.isSubscribed = true;
      this._updateUI();
      return true;
    }
    return false;
  },

  applyLicenseCode() {
    const input = document.getElementById('licenseCodeInput');
    const code = input ? input.value.trim().toUpperCase() : '';

    if (!code) {
      alert('Bitte gib einen Lizenzcode ein.');
      return;
    }

    if (VALID_LICENSE_CODES.includes(code)) {
      // Code ist gültig – im Local Storage speichern
      localStorage.setItem('sPro_active_license_code', code);
      this.isSubscribed = true;
      if (input) input.value = '';
      this._updateUI();
      alert('Lizenzcode erfolgreich eingelöst! Willkommen bei SmartHockey Pro.');
    } else {
      // Code ist ungültig
      alert('Ungültiger Lizenzcode. Bitte überprüfe deine Eingabe und versuche es erneut.');
    }
  },

  // -- ENDE LIZENZCODE-METHODEN --

  async _loadProductDetails() {
    if (!this._service) return;
    try {
      const details = await this._service.getDetails([this.PRODUCT_ID]);
      if (details && details.length > 0) {
        const product = details[0];
        console.log('[Billing] Produktdetails geladen:', product.title, product.price);
        const priceEl = document.querySelector('.price-amount');
        if (priceEl && product.price) {
          priceEl.textContent = product.price;
        }
      }
    } catch (err) {
      console.warn('[Billing] Produktdetails konnten nicht geladen werden:', err);
    }
  },

  async _checkEntitlements() {
    if (!this._service) {
      this._checkLocalCache();
      return;
    }
    try {
      const entitlements = await this._service.listPurchases();
      const active = entitlements && entitlements.some(
        (e) => e.itemId === this.PRODUCT_ID
      );
      if (active) {
        console.log('[Billing] ✅ Aktives Abonnement gefunden');
        this.isSubscribed = true;
        this._saveSubscriptionState(true);
        this._updateUI();
      } else {
        console.log('[Billing] ❌ Kein aktives Abonnement');
        this.isSubscribed = false;
        this._saveSubscriptionState(false);
        this._updateUI();
      }
    } catch (err) {
      console.warn('[Billing] Abo-Prüfung fehlgeschlagen:', err);
      this._checkLocalCache();
    }
  },

  _checkLocalCache() {
    const active = localStorage.getItem('subscription_active');
    const checkDate = localStorage.getItem('subscription_check_date');

    if (active === 'true' && checkDate) {
      const daysSinceCheck = (Date.now() - parseInt(checkDate, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceCheck <= BILLING_GRACE_PERIOD_DAYS) {
        console.log('[Billing] Offline-Toleranzzeitraum – Zugriff gewährt');
        this.isSubscribed = true;
        this._updateUI();
        return;
      }
    }

    this.isSubscribed = false;
    this._updateUI();
  },

  _saveSubscriptionState(active) {
    localStorage.setItem('subscription_active', active ? 'true' : 'false');
    localStorage.setItem('subscription_check_date', String(Date.now()));
  },

  async purchase() {
    if (!this.isTWA) return;

    const paymentMethods = [{
      supportedMethods: BILLING_PLAY_METHOD,
      data: { sku: this.PRODUCT_ID }
    }];
    // Der Betrag hier ist ein Platzhalter, der von der PaymentRequest API benötigt wird.
    // Der tatsächliche Preis wird in der Google Play Console festgelegt und im Play Store Kaufdialog angezeigt.
    const paymentDetails = { total: { label: 'SmartHockey Pro', amount: { currency: 'USD', value: '0' } } };

    try {
      const request = new PaymentRequest(paymentMethods, paymentDetails);
      const canPay = await request.canMakePayment();
      if (!canPay) {
        alert('Google Play Billing ist nicht verfügbar. Bitte versuche es erneut.');
        return;
      }
      const response = await request.show();
      await response.complete('success');

      console.log('[Billing] ✅ Kauf erfolgreich');
      this.isSubscribed = true;
      this._saveSubscriptionState(true);
      this._updateUI();
    } catch (err) {
      if (err && err.name === 'AbortError') {
        console.log('[Billing] Kauf durch Benutzer abgebrochen');
      } else {
        console.error('[Billing] Fehler beim Kauf:', err);
        alert('Kauf fehlgeschlagen. Bitte versuche es erneut.');
      }
    }
  },

  async restorePurchases() {
    if (!this.isTWA) return;
    await this._checkEntitlements();
    if (this.isSubscribed) {
      alert('Käufe erfolgreich wiederhergestellt!');
    } else {
      alert('Kein aktives Abonnement gefunden. Wenn du glaubst, dass du ein aktives Abonnement hast, überprüfe bitte deine Internetverbindung und versuche es erneut.');
    }
  },

  _updateUI() {
    const paywall = document.getElementById('subscriptionPaywall');
    const content = document.getElementById('appContent');

    if (this.isSubscribed) {
      if (paywall) paywall.style.display = 'none';
      if (content) content.style.display = 'flex';
      document.body.classList.remove('locked');
      document.body.classList.add('subscribed');
    } else {
      if (paywall) paywall.style.display = 'flex';
      if (content) content.style.display = 'none';
      document.body.classList.remove('subscribed');
      document.body.classList.add('locked');
    }
  }
};
