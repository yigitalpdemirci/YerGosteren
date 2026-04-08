// Firebase modüllerini import ediyoruz (Kullanıma hazır)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
/* 
=========================================
  FIREBASE AYARLARI (KURULUM İÇİN)
=========================================
Buradaki 'const isFirebaseReady = false' değerini true yapıp, 
aşağıdaki ayarları kendi projenizin ayarlarıyla değiştirdiğinizde canli veritabani tamamen aktif olacaktir. 
*/
const isFirebaseReady = true;

const firebaseConfig = {
    apiKey: "AIzaSyA9kru0goRXfw9nXncdrL1ybD7JSWgQxNs",
    authDomain: "yergosteren-5ecb2.firebaseapp.com",
    projectId: "yergosteren-5ecb2",
    storageBucket: "yergosteren-5ecb2.firebasestorage.app",
    messagingSenderId: "1037224814918",
    appId: "1:1037224814918:web:e27a2a8a1779d99d77dd47",
    measurementId: "G-7XQLKF9W5G"
};
// Değişkenler
let database = null;
let capacityRef = null;
let currentCapacity = 0;
const MAX_CAPACITY = 200; // Örnek kapasite

// DOM Elementleri
const countDisplay = document.getElementById("count-display");
const btnEnter = document.getElementById("btn-enter");
const btnExit = document.getElementById("btn-exit");
const statusMessage = document.getElementById("status-message");
const capacityRing = document.getElementById("capacity-ring");
const connectionStatus = document.getElementById("connection-status");

// === UYGULAMA BAŞLANGIÇ ===
function init() {
    setupDatabase();
    checkUrlParamsForQR();
    setupEventListeners();
    updateButtonStates();
}

function setupDatabase() {
    if (isFirebaseReady) {
        try {
            const app = initializeApp(firebaseConfig);
            const analytics = getAnalytics(app);
            database = getDatabase(app);
            capacityRef = ref(database, 'library/occupancy');

            // Veri değiştikçe anlık güncelle
            onValue(capacityRef, (snapshot) => {
                const val = snapshot.val();
                if (val !== null) {
                    updateDisplay(val);
                } else {
                    // İlk kez çalışıyorsa
                    runTransaction(capacityRef, () => 0);
                }
            });
            connectionStatus.textContent = "Canlı (🔥 Firebase)";
        } catch (error) {
            console.error("Firebase başlatılamadı:", error);
            setupMockDatabase();
        }
    } else {
        setupMockDatabase();
    }
}

// Firebase kurulana kadar test amaçlı yerel veritabanı
function setupMockDatabase() {
    connectionStatus.textContent = "Test Modu (Yerel)";
    connectionStatus.parentElement.style.background = "rgba(245, 158, 11, 0.1)";
    connectionStatus.parentElement.querySelector('.pulse-dot').style.backgroundColor = "#f59e0b";
    connectionStatus.style.color = "#f59e0b";

    // Tarayıcıdaki son değeri al
    currentCapacity = parseInt(localStorage.getItem('mockLibraryCount')) || 0;
    updateDisplay(currentCapacity);

    // Aynı cihazdaki sekmeler arası senkronizasyon (Sahte canlılık)
    window.addEventListener('storage', (e) => {
        if (e.key === 'mockLibraryCount') {
            updateDisplay(parseInt(e.newValue) || 0);
        }
    });
}

function updateDatabase(increment) {
    if (isFirebaseReady && database && capacityRef) {
        // Gerçek çoklu kullanıcı çakışmalarını önlemek için transaction kullanılır
        runTransaction(capacityRef, (currentData) => {
            let newVal = (currentData || 0) + increment;
            return newVal < 0 ? 0 : newVal;
        });
    } else {
        // Test modu simülasyonu
        currentCapacity += increment;
        if (currentCapacity < 0) currentCapacity = 0;
        localStorage.setItem('mockLibraryCount', currentCapacity);
        updateDisplay(currentCapacity);

        // Storage event'i kendi penceremizde tetiklenmez, o yüzden manuel çağırıyoruz
        window.dispatchEvent(new Event('storage'));
    }
}

function updateDisplay(newCount) {
    // Animasyon ekle
    if (currentCapacity !== newCount) {
        countDisplay.classList.remove('pop');
        void countDisplay.offsetWidth; // Reflow tetikle
        countDisplay.classList.add('pop');
    }

    currentCapacity = newCount;
    countDisplay.textContent = currentCapacity;

    // Doluluğa göre arayüz tepkisi
    if (currentCapacity >= MAX_CAPACITY * 0.9) {
        capacityRing.classList.add('full');
    } else {
        capacityRing.classList.remove('full');
    }
}

// === İŞ MANTIĞI & SPAM KORUMASI ===

function handleAction(actionType) {
    const lastAction = localStorage.getItem('libraryStatus'); // "inside" veya "outside"
    const lastActionTime = parseInt(localStorage.getItem('libraryStatusTime')) || 0;
    const now = new Date().getTime();

    // 12 Saat içerisinde otomatik çıkış yapmış sayalım (hata koruması)
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    let isStatusValid = (now - lastActionTime) < TWELVE_HOURS;

    if (actionType === 'enter') {
        if (lastAction === 'inside' && isStatusValid) {
            showMessage('Zaten içeride görünüyorsunuz!', 'error');
            return;
        }
        updateDatabase(1);
        localStorage.setItem('libraryStatus', 'inside');
        localStorage.setItem('libraryStatusTime', now.toString());
        showMessage('Girişiniz kaydedildi. İyi çalışmalar!', 'success');

    } else if (actionType === 'exit') {
        if ((lastAction === 'outside' || !lastAction) || (lastAction === 'inside' && !isStatusValid)) {
            showMessage('Zaten dışarıda görünüyorsunuz!', 'error');
            return;
        }
        updateDatabase(-1);
        localStorage.setItem('libraryStatus', 'outside');
        localStorage.setItem('libraryStatusTime', now.toString());
        showMessage('Çıkışınız kaydedildi. Görüşmek üzere!', 'success');
    }

    updateButtonStates();

    // URL parametresi ile geldiyse URL'i temizle
    window.history.replaceState({}, document.title, window.location.pathname);
}

function updateButtonStates() {
    const lastAction = localStorage.getItem('libraryStatus');
    const lastActionTime = parseInt(localStorage.getItem('libraryStatusTime')) || 0;
    const now = new Date().getTime();
    const isStatusValid = (now - lastActionTime) < (12 * 60 * 60 * 1000);

    if (lastAction === 'inside' && isStatusValid) {
        btnEnter.disabled = true;
        btnExit.disabled = false;
        btnEnter.style.opacity = "0.4";
        btnExit.style.opacity = "1";
    } else {
        // outside veya geçersiz (yeni kullanıcı)
        btnEnter.disabled = false;
        btnExit.disabled = true;
        btnEnter.style.opacity = "1";
        btnExit.style.opacity = "0.4";
    }
}

function showMessage(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = `status-message ${type}`;

    setTimeout(() => {
        statusMessage.classList.add('hidden');
    }, 4000);
}

// === QR KOD TETİKLEYİCİSİ ===
function checkUrlParamsForQR() {
    const urlParams = new URLSearchParams(window.location.search);
    const islem = urlParams.get('islem'); // ?islem=giris veya ?islem=cikis

    if (islem === 'giris') {
        setTimeout(() => handleAction('enter'), 500);
    } else if (islem === 'cikis') {
        setTimeout(() => handleAction('exit'), 500);
    }
}

function setupEventListeners() {
    btnEnter.addEventListener("click", () => handleAction('enter'));
    btnExit.addEventListener("click", () => handleAction('exit'));
}

// Uygulamayı başlat
document.addEventListener("DOMContentLoaded", init);
