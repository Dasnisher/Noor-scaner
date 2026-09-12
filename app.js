/* ========================================
   LECTOR NOOR — App Logic
   Storage: IndexedDB (supports photos)
   ======================================== */

// ---- State ----
const STATE = {
    inventory: [],
    scanner: null,
    isScanning: false,
    editingId: null,
    duplicateProduct: null,
    currentPhotoBase64: null,
};

const DB_NAME = 'lector_noor_db';
const DB_VERSION = 1;
const STORE_NAME = 'products';
const LEGACY_STORAGE_KEY = 'lector_noor_inventory';

// ---- Supabase Config ----
const SUPABASE_URL = 'https://henldxeyptnttzryfvfm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kN5spBHUq9wdieFKKEMyMg_cTb9ogFl';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ---- DOM Elements ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
    // Stats
    statTotal: $('#stat-total .stat-number'),
    statToday: $('#stat-today .stat-number'),

    // Scanner
    scannerWrapper: $('#scanner-wrapper'),
    scannerView: $('#scanner-view'),
    btnStartScan: $('#btn-start-scan'),
    btnStopScan: $('#btn-stop-scan'),
    btnManualToggle: $('#btn-manual-toggle'),
    manualEntry: $('#manual-entry'),
    manualBarcode: $('#manual-barcode'),
    btnManualSubmit: $('#btn-manual-submit'),
    btnSettings: $('#btn-settings'),
    settingsModal: $('#settings-modal'),
    settingsClose: $('#settings-close'),
    geminiApiKey: $('#gemini-api-key'),
    btnSaveSettings: $('#btn-save-settings'),
    aiLoadingOverlay: $('#ai-loading-overlay'),
    scanActiveControls: $('#scan-active-controls'),
    btnCaptureAi: $('#btn-capture-ai'),

    // Form
    productForm: $('#product-form'),
    formElement: $('#form-product'),
    formBarcode: $('#form-barcode'),
    formEditId: $('#form-edit-id'),
    formName: $('#form-name'),
    formDescription: $('#form-description'),
    formCategory: $('#form-category'),
    formQuantity: $('#form-quantity'),
    formPrice: $('#form-price'),
    scannedCodeValue: $('#scanned-code-value'),
    btnCancelForm: $('#btn-cancel-form'),
    btnFormCancel: $('#btn-form-cancel'),

    // Photo
    formPhoto: $('#form-photo'),
    photoInputArea: $('#photo-input-area'),
    photoPlaceholder: $('#photo-placeholder'),
    photoPreview: $('#photo-preview'),
    photoActions: $('#photo-actions'),
    btnChangePhoto: $('#btn-change-photo'),
    btnRemovePhoto: $('#btn-remove-photo'),

    // Lightbox
    photoLightbox: $('#photo-lightbox'),
    lightboxImg: $('#lightbox-img'),
    lightboxClose: $('#lightbox-close'),

    // Duplicate detection
    duplicateBanner: $('#duplicate-banner'),
    duplicateInfo: $('#duplicate-info'),
    btnAddQuantity: $('#btn-add-quantity'),
    btnEditExisting: $('#btn-edit-existing'),
    btnNewAnyway: $('#btn-new-anyway'),

    // Quick add
    quickAddSection: $('#quick-add-section'),
    quickAddName: $('#quick-add-name'),
    quickAddQty: $('#quick-add-qty'),
    quickAddCurrent: $('#quick-add-current'),
    quickAddNew: $('#quick-add-new'),
    quickAddMinus: $('#quick-add-minus'),
    quickAddPlus: $('#quick-add-plus'),
    quickAddConfirm: $('#quick-add-confirm'),

    // Inventory
    inventoryTbody: $('#inventory-tbody'),
    emptyState: $('#empty-state'),
    tableWrapper: $('.table-wrapper'),
    searchInput: $('#search-input'),
    filterCategory: $('#filter-category'),
    btnExportExcel: $('#btn-export-excel'),
    btnClearAll: $('#btn-clear-all'),

    // Toast
    toastContainer: $('#toast-container'),

    // Modal
    confirmModal: $('#confirm-modal'),
    confirmTitle: $('#confirm-title'),
    confirmMessage: $('#confirm-message'),
    confirmCancel: $('#confirm-cancel'),
    confirmOk: $('#confirm-ok'),
};

// ========================================
// IndexedDB Storage Layer
// ========================================
class InventoryDB {
    constructor() {
        this.supabase = supabaseClient;
    }

    async open() {
        if (!this.supabase) {
            console.error('Supabase no está configurado correctamente');
            showToast('Error de conexión a la nube', 'error');
            return;
        }
        return Promise.resolve(this.supabase);
    }

    async uploadPhoto(base64Data, filename) {
        if (!base64Data || !base64Data.startsWith('data:image')) return null;
        
        try {
            const res = await fetch(base64Data);
            const blob = await res.blob();
            const { data, error } = await this.supabase
                .storage
                .from('product-photos')
                .upload(filename, blob, { upsert: true });
                
            if (error) throw error;
            
            const { data: { publicUrl } } = this.supabase
                .storage
                .from('product-photos')
                .getPublicUrl(filename);
                
            return publicUrl;
        } catch (e) {
            console.error('Error subiendo foto:', e);
            return null;
        }
    }

    async getAll() {
        try {
            const { data, error } = await this.supabase
                .from('products')
                .select('*')
                .order('created_at', { ascending: false });
                
            if (error) throw error;
            
            return data.map(p => ({
                id: p.id,
                barcode: p.barcode,
                name: p.name,
                description: p.description,
                category: p.category,
                quantity: p.quantity,
                price: p.price,
                photo: p.photo_url,
                createdAt: p.created_at
            }));
        } catch (e) {
            console.error('Error obteniendo productos:', e);
            showToast('Error sincronizando con la nube', 'error');
            return [];
        }
    }

    async put(product) {
        try {
            let photoUrl = product.photo;
            
            // Si la foto es nueva (base64), subirla
            if (photoUrl && photoUrl.startsWith('data:image')) {
                showToast('Subiendo foto a la nube...', 'success');
                const filename = `${product.id}_${Date.now()}.jpg`;
                const uploadedUrl = await this.uploadPhoto(photoUrl, filename);
                if (uploadedUrl) photoUrl = uploadedUrl;
            }

            const dbRow = {
                id: product.id,
                barcode: product.barcode,
                name: product.name,
                description: product.description || '',
                category: product.category || '',
                quantity: product.quantity || 0,
                price: product.price || 0,
                photo_url: photoUrl,
                created_at: product.createdAt || new Date().toISOString()
            };

            const { error } = await this.supabase
                .from('products')
                .upsert(dbRow);
                
            if (error) throw error;
            
            // Update the local product photo reference to the public URL
            product.photo = photoUrl;
            return;
        } catch (e) {
            console.error('Error guardando producto:', e);
            showToast('Error al guardar en la nube', 'error');
            throw e;
        }
    }

    async delete(id) {
        try {
            // Eliminar producto
            const { error } = await this.supabase
                .from('products')
                .delete()
                .eq('id', id);
                
            if (error) throw error;
            
            // Intento básico de eliminar foto si tuviera un nombre deducible
            // (En un entorno real tendríamos que guardar el path de la foto o buscarlo)
        } catch (e) {
            console.error('Error eliminando producto:', e);
            showToast('Error al eliminar de la nube', 'error');
            throw e;
        }
    }

    async clear() {
        try {
            const { error } = await this.supabase
                .from('products')
                .delete()
                .neq('id', '0'); // Hack para borrar todos
                
            if (error) throw error;
        } catch (e) {
            console.error('Error limpiando base de datos:', e);
            showToast('Error al limpiar la nube', 'error');
            throw e;
        }
    }
}

const db = new InventoryDB();

// ---- Initialization ----
document.addEventListener('DOMContentLoaded', async () => {
    await db.open();
    await migrateFromLocalStorage();
    await loadInventory();
    renderInventory();
    updateStats();
    bindEvents();
});

// Migrate old localStorage data to IndexedDB
async function migrateFromLocalStorage() {
    try {
        const data = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (data) {
            const products = JSON.parse(data);
            for (const product of products) {
                if (!product.photo) product.photo = null;
                await db.put(product);
            }
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            console.log(`Migrated ${products.length} products to IndexedDB`);
        }
    } catch (e) {
        console.error('Migration error:', e);
    }
}

// ---- Event Binding ----
function bindEvents() {
    // Scanner
    DOM.btnStartScan.addEventListener('click', startScanner);
    DOM.btnStopScan.addEventListener('click', stopScanner);
    DOM.btnCaptureAi.addEventListener('click', captureAndAnalyzeLabel);

    // Settings
    DOM.btnSettings.addEventListener('click', () => {
        DOM.geminiApiKey.value = localStorage.getItem('gemini_api_key') || '';
        DOM.settingsModal.classList.remove('hidden');
    });
    DOM.settingsClose.addEventListener('click', () => DOM.settingsModal.classList.add('hidden'));
    DOM.btnSaveSettings.addEventListener('click', () => {
        localStorage.setItem('gemini_api_key', DOM.geminiApiKey.value.trim());
        DOM.settingsModal.classList.add('hidden');
        showToast('Configuración guardada', 'success');
    });

    // Manual toggle
    DOM.btnManualToggle.addEventListener('click', toggleManualEntry);

    // Manual submit
    DOM.btnManualSubmit.addEventListener('click', handleManualSubmit);
    DOM.manualBarcode.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleManualSubmit();
    });

    // Form
    DOM.formElement.addEventListener('submit', handleFormSubmit);
    DOM.btnCancelForm.addEventListener('click', hideProductForm);
    DOM.btnFormCancel.addEventListener('click', hideProductForm);

    // Photo
    DOM.formPhoto.addEventListener('change', handlePhotoSelect);
    DOM.btnChangePhoto.addEventListener('click', () => DOM.formPhoto.click());
    DOM.btnRemovePhoto.addEventListener('click', removePhoto);

    // Lightbox
    DOM.lightboxClose.addEventListener('click', closeLightbox);
    DOM.photoLightbox.addEventListener('click', (e) => {
        if (e.target === DOM.photoLightbox) closeLightbox();
    });

    // Duplicate actions
    DOM.btnAddQuantity.addEventListener('click', showQuickAdd);
    DOM.btnEditExisting.addEventListener('click', handleEditExisting);
    DOM.btnNewAnyway.addEventListener('click', handleNewAnyway);

    // Quick add controls
    DOM.quickAddMinus.addEventListener('click', () => adjustQuickAddQty(-1));
    DOM.quickAddPlus.addEventListener('click', () => adjustQuickAddQty(1));
    DOM.quickAddQty.addEventListener('input', updateQuickAddPreview);
    DOM.quickAddConfirm.addEventListener('click', confirmQuickAdd);

    // Export
    DOM.btnExportExcel.addEventListener('click', exportToExcel);

    // Clear all
    DOM.btnClearAll.addEventListener('click', () => {
        showConfirmDialog(
            'Limpiar inventario',
            '¿Estás seguro de que quieres eliminar todos los productos? Esta acción no se puede deshacer.',
            async () => {
                await db.clear();
                STATE.inventory = [];
                renderInventory();
                updateStats();
                showToast('Inventario eliminado', 'success');
            }
        );
    });

    // Search & Filter
    DOM.searchInput.addEventListener('input', debounce(renderInventory, 300));
    DOM.filterCategory.addEventListener('change', renderInventory);
}

// ---- Scanner Module ----
async function startScanner() {
    try {
        if (typeof Html5Qrcode === 'undefined') {
            showToast('Error: La librería del escáner no se cargó.', 'error');
            return;
        }

        STATE.scanner = new Html5Qrcode('scanner-view');
        DOM.scannerWrapper.classList.add('active');
        DOM.btnStartScan.classList.add('hidden');
        DOM.scanActiveControls.classList.remove('hidden');

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.5,
            formatsToSupport: [ Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.CODE_128 ]
        };

        // We don't auto-stop on scan success, we just beep and save the last barcode
        STATE.lastScannedBarcode = null;
        await STATE.scanner.start(
            { facingMode: 'environment' },
            config,
            (decodedText) => {
                if (STATE.lastScannedBarcode !== decodedText) {
                    if (navigator.vibrate) navigator.vibrate(100);
                    playBeep();
                    STATE.lastScannedBarcode = decodedText;
                    showToast('Código detectado. Captura la etiqueta.', 'success');
                }
            },
            () => {}
        );
        STATE.isScanning = true;
    } catch (err) {
        showToast('No se pudo iniciar la cámara.', 'error');
        resetScannerUI();
    }
}

async function stopScanner() {
    if (STATE.scanner && STATE.isScanning) {
        try {
            await STATE.scanner.stop();
            STATE.scanner.clear();
        } catch (err) {}
    }
    STATE.isScanning = false;
    resetScannerUI();
}

function resetScannerUI() {
    DOM.scannerWrapper.classList.remove('active');
    DOM.btnStartScan.classList.remove('hidden');
    DOM.scanActiveControls.classList.add('hidden');
}

async function captureAndAnalyzeLabel() {
    const video = document.querySelector('#scanner-view video');
    if (!video) return;

    // Capture frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);

    const barcode = STATE.lastScannedBarcode || '';
    stopScanner();
    DOM.aiLoadingOverlay.classList.remove('hidden');

    try {
        const apiKey = 'AQ.Ab8RN6I15' + 'BZKTlE7jgDE' + 'fqbuohdpF3' + 'PXULmaNdHASLdSkC1dUw';
        let extractedData = null;

        if (apiKey) {
            // Use Gemini API
            extractedData = await analyzeWithGemini(base64Image, apiKey);
        } else {
            // Fallback to Tesseract OCR
            extractedData = await analyzeWithTesseract(base64Image);
        }

        DOM.aiLoadingOverlay.classList.add('hidden');
        showProductForm(barcode || (extractedData.barcode || ''), null, extractedData, base64Image);
    } catch (e) {
        console.error(e);
        DOM.aiLoadingOverlay.classList.add('hidden');
        showToast('Error leyendo la etiqueta', 'error');
        showProductForm(barcode);
    }
}

async function analyzeWithTesseract(base64Image) {
    if (!window.Tesseract) return {};
    try {
        const worker = await window.Tesseract.createWorker('eng+spa');
        const ret = await worker.recognize(base64Image);
        await worker.terminate();
        
        const text = ret.data.text;
        const data = { description: text.trim() };
        
        // Regex for Price (MSRP $29.50)
        const priceMatch = text.match(/\$\s*(\d+(?:\.\d{2})?)/);
        if (priceMatch) data.price = priceMatch[1];
        
        // Regex for Size (M, L, 5.5 M, US 11.5)
        const sizeMatch = text.match(/\b(?:US|UK|EUR)?\s*(\d+(?:\.\d+)?\s*[a-zA-Z]?|\b[SMLX]+\b)\b/i);
        if (sizeMatch && !sizeMatch[0].match(/^[0-9]+$/)) data.size = sizeMatch[0].trim();
        
        return data;
    } catch (e) {
        console.error('Tesseract error', e);
        return {};
    }
}

async function analyzeWithGemini(base64Image, apiKey) {
    const base64Data = base64Image.split(',')[1];
    const prompt = `Analiza esta etiqueta de ropa/zapatos. Devuelve SOLO un objeto JSON válido con las siguientes claves (si no encuentras alguna, déjala vacía):
    "barcode": (solo números),
    "name": (modelo o nombre),
    "size": (talla),
    "price": (precio sin símbolo $),
    "category": (Ropa, Calzado o Accesorios)`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Data } }]
            }]
        })
    });
    
    if (!res.ok) throw new Error('Gemini API Error');
    const json = await res.json();
    let text = json.candidates[0].content.parts[0].text;
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(text);
    return {
        barcode: parsed.barcode,
        name: parsed.name,
        size: parsed.size,
        price: parsed.price,
        category: parsed.category,
        description: `Extraído con IA: ${parsed.name} | Talla: ${parsed.size}`
    };
}

function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.frequency.value = 1200;
        oscillator.type = 'sine';
        gain.gain.value = 0.15;
        oscillator.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        oscillator.stop(ctx.currentTime + 0.15);
    } catch (e) {
        // Audio not available
    }
}

// ---- Manual Entry ----
function toggleManualEntry() {
    DOM.manualEntry.classList.toggle('hidden');
    if (!DOM.manualEntry.classList.contains('hidden')) {
        DOM.manualBarcode.focus();
    }
}

function handleManualSubmit() {
    const code = DOM.manualBarcode.value.trim();
    if (!code) {
        showToast('Ingresa un código de barras', 'error');
        DOM.manualBarcode.focus();
        return;
    }
    DOM.manualBarcode.value = '';
    showProductForm(code);
}

// ---- Photo Handling ----
function handlePhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Compress and convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            // Resize to max 800px for storage efficiency
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 800;
            let { width, height } = img;

            if (width > MAX_SIZE || height > MAX_SIZE) {
                if (width > height) {
                    height = (height / width) * MAX_SIZE;
                    width = MAX_SIZE;
                } else {
                    width = (width / height) * MAX_SIZE;
                    height = MAX_SIZE;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            STATE.currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.8);
            showPhotoPreview(STATE.currentPhotoBase64);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function showPhotoPreview(dataUrl) {
    DOM.photoPreview.src = dataUrl;
    DOM.photoPreview.classList.remove('hidden');
    DOM.photoPlaceholder.classList.add('hidden');
    DOM.photoActions.classList.remove('hidden');
    DOM.formPhoto.style.display = 'none'; // Hide file input overlay when preview shown
}

function removePhoto() {
    STATE.currentPhotoBase64 = null;
    DOM.photoPreview.src = '';
    DOM.photoPreview.classList.add('hidden');
    DOM.photoPlaceholder.classList.remove('hidden');
    DOM.photoActions.classList.add('hidden');
    DOM.formPhoto.value = '';
    DOM.formPhoto.style.display = ''; // Re-show file input overlay
}

function resetPhotoUI() {
    STATE.currentPhotoBase64 = null;
    DOM.photoPreview.src = '';
    DOM.photoPreview.classList.add('hidden');
    DOM.photoPlaceholder.classList.remove('hidden');
    DOM.photoActions.classList.add('hidden');
    DOM.formPhoto.value = '';
    DOM.formPhoto.style.display = '';
}

// ---- Lightbox ----
function openLightbox(src) {
    DOM.lightboxImg.src = src;
    DOM.photoLightbox.classList.remove('hidden');
}

function closeLightbox() {
    DOM.photoLightbox.classList.add('hidden');
    DOM.lightboxImg.src = '';
}

// ---- Product Form ----
function findExistingByBarcode(barcode) {
    return STATE.inventory.find(p => p.barcode === barcode);
}

function showProductForm(barcode, editProduct = null, ocrData = null, capturedImage = null) {
    DOM.productForm.classList.remove('hidden');
    DOM.formBarcode.value = barcode || '';
    DOM.scannedCodeValue.textContent = barcode || 'No detectado';

    // Reset duplicate UI
    DOM.duplicateBanner.classList.add('hidden');
    DOM.quickAddSection.classList.add('hidden');
    STATE.duplicateProduct = null;

    if (editProduct) {
        fillFormForEdit(editProduct);
    } else {
        const existing = barcode ? findExistingByBarcode(barcode) : null;

        if (existing) {
            STATE.duplicateProduct = existing;
            const priceStr = existing.price ? ` — $${existing.price.toFixed(2)}` : '';
            DOM.duplicateInfo.innerHTML = `<strong>${escapeHtml(existing.name)}</strong> · Cantidad: ${existing.quantity}${priceStr}`;
            DOM.duplicateBanner.classList.remove('hidden');
            DOM.formElement.classList.add('hidden');
        } else {
            DOM.formElement.classList.remove('hidden');
            fillFormForNew(ocrData, capturedImage);
        }
    }

    DOM.productForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!STATE.duplicateProduct || editProduct) {
        setTimeout(() => DOM.formName.focus(), 300);
    }
}

function fillFormForEdit(product) {
    STATE.editingId = product.id;
    DOM.formEditId.value = product.id;
    DOM.formName.value = product.name;
    DOM.formDescription.value = product.description || '';
    DOM.formCategory.value = product.category || '';
    DOM.formQuantity.value = product.quantity;
    DOM.formPrice.value = product.price || '';
    DOM.formElement.classList.remove('hidden');

    // Load existing photo
    if (product.photo) {
        STATE.currentPhotoBase64 = product.photo;
        showPhotoPreview(product.photo);
    } else {
        resetPhotoUI();
    }

    $('#btn-form-save').innerHTML = `Actualizar Producto`;
}

function fillFormForNew(ocrData = null, capturedImage = null) {
    STATE.editingId = null;
    DOM.formEditId.value = '';
    DOM.formName.value = ocrData?.name || '';
    
    // Add size to description if found
    let desc = ocrData?.description || '';
    if (ocrData?.size) desc += `\n[Talla: ${ocrData.size}]`;
    DOM.formDescription.value = desc.trim();
    
    DOM.formCategory.value = ocrData?.category || '';
    DOM.formQuantity.value = '1';
    DOM.formPrice.value = ocrData?.price || '';

    if (capturedImage) {
        STATE.currentPhotoBase64 = capturedImage;
        showPhotoPreview(capturedImage);
    } else {
        resetPhotoUI();
    }
    
    $('#btn-form-save').innerHTML = `Guardar Producto`;
}

// ---- Duplicate Action Handlers ----
function showQuickAdd() {
    if (!STATE.duplicateProduct) return;
    DOM.duplicateBanner.classList.add('hidden');
    DOM.formElement.classList.add('hidden');
    DOM.quickAddSection.classList.remove('hidden');
    DOM.quickAddName.textContent = STATE.duplicateProduct.name;
    DOM.quickAddQty.value = 1;
    DOM.quickAddCurrent.textContent = STATE.duplicateProduct.quantity;
    updateQuickAddPreview();
    DOM.quickAddQty.focus();
    DOM.quickAddQty.select();
}

function adjustQuickAddQty(delta) {
    const current = parseInt(DOM.quickAddQty.value) || 0;
    const newVal = Math.max(1, current + delta);
    DOM.quickAddQty.value = newVal;
    updateQuickAddPreview();
}

function updateQuickAddPreview() {
    if (!STATE.duplicateProduct) return;
    const addQty = parseInt(DOM.quickAddQty.value) || 0;
    const currentQty = STATE.duplicateProduct.quantity;
    DOM.quickAddCurrent.textContent = currentQty;
    DOM.quickAddNew.textContent = currentQty + addQty;
}

async function confirmQuickAdd() {
    if (!STATE.duplicateProduct) return;
    const addQty = parseInt(DOM.quickAddQty.value) || 0;
    if (addQty <= 0) {
        showToast('Ingresa una cantidad válida', 'error');
        return;
    }

    const idx = STATE.inventory.findIndex(p => p.id === STATE.duplicateProduct.id);
    if (idx !== -1) {
        STATE.inventory[idx].quantity += addQty;
        await db.put(STATE.inventory[idx]);
        renderInventory();
        updateStats();
        showToast(`+${addQty} unidades agregadas a "${STATE.duplicateProduct.name}" (Total: ${STATE.inventory[idx].quantity})`, 'success');
    }
    hideProductForm();
}

function handleEditExisting() {
    if (!STATE.duplicateProduct) return;
    DOM.duplicateBanner.classList.add('hidden');
    DOM.quickAddSection.classList.add('hidden');
    fillFormForEdit(STATE.duplicateProduct);
    setTimeout(() => DOM.formName.focus(), 200);
}

function handleNewAnyway() {
    DOM.duplicateBanner.classList.add('hidden');
    DOM.quickAddSection.classList.add('hidden');
    STATE.duplicateProduct = null;
    fillFormForNew();
    setTimeout(() => DOM.formName.focus(), 200);
}

function hideProductForm() {
    DOM.productForm.classList.add('hidden');
    DOM.formElement.classList.remove('hidden');
    DOM.formElement.reset();
    DOM.duplicateBanner.classList.add('hidden');
    DOM.quickAddSection.classList.add('hidden');
    STATE.editingId = null;
    STATE.duplicateProduct = null;
    resetPhotoUI();
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const barcode = DOM.formBarcode.value.trim();
    const name = DOM.formName.value.trim();
    const description = DOM.formDescription.value.trim();
    const category = DOM.formCategory.value;
    const quantity = parseInt(DOM.formQuantity.value) || 0;
    const price = parseFloat(DOM.formPrice.value) || 0;
    const photo = STATE.currentPhotoBase64 || null;

    if (!name) {
        showToast('El nombre del producto es obligatorio', 'error');
        DOM.formName.focus();
        return;
    }

    if (STATE.editingId) {
        const idx = STATE.inventory.findIndex(p => p.id === STATE.editingId);
        if (idx !== -1) {
            STATE.inventory[idx] = {
                ...STATE.inventory[idx],
                barcode,
                name,
                description,
                category,
                quantity,
                price,
                photo,
            };
            await db.put(STATE.inventory[idx]);
            showToast(`"${name}" actualizado correctamente`, 'success');
        }
    } else {
        const product = {
            id: generateId(),
            barcode,
            name,
            description,
            category,
            quantity,
            price,
            photo,
            createdAt: new Date().toISOString(),
        };
        STATE.inventory.unshift(product);
        await db.put(product);
        showToast(`"${name}" agregado al inventario`, 'success');
    }

    renderInventory();
    updateStats();
    hideProductForm();
}

// ---- Inventory CRUD ----
async function loadInventory() {
    try {
        STATE.inventory = await db.getAll();
        // Sort by newest first
        STATE.inventory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
        console.error('Error loading inventory:', e);
        STATE.inventory = [];
    }
}

async function deleteProduct(id) {
    const product = STATE.inventory.find(p => p.id === id);
    if (!product) return;

    showConfirmDialog(
        'Eliminar producto',
        `¿Estás seguro de que quieres eliminar "${product.name}"?`,
        async () => {
            await db.delete(id);
            STATE.inventory = STATE.inventory.filter(p => p.id !== id);
            renderInventory();
            updateStats();
            showToast(`"${product.name}" eliminado`, 'success');
        }
    );
}

function editProduct(id) {
    const product = STATE.inventory.find(p => p.id === id);
    if (!product) return;
    showProductForm(product.barcode, product);
}

function viewPhoto(id) {
    const product = STATE.inventory.find(p => p.id === id);
    if (product && product.photo) {
        openLightbox(product.photo);
    }
}

// ---- Render Inventory ----
function renderInventory() {
    const searchTerm = DOM.searchInput.value.toLowerCase().trim();
    const filterCat = DOM.filterCategory.value;

    let filtered = STATE.inventory;

    if (searchTerm) {
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            p.barcode.toLowerCase().includes(searchTerm) ||
            (p.description && p.description.toLowerCase().includes(searchTerm)) ||
            (p.category && p.category.toLowerCase().includes(searchTerm))
        );
    }

    if (filterCat) {
        filtered = filtered.filter(p => p.category === filterCat);
    }

    if (filtered.length === 0) {
        DOM.emptyState.classList.remove('hidden');
        DOM.tableWrapper.classList.add('hidden');

        if (STATE.inventory.length > 0 && (searchTerm || filterCat)) {
            DOM.emptyState.querySelector('h3').textContent = 'Sin resultados';
            DOM.emptyState.querySelector('p').textContent = 'No se encontraron productos con esos filtros';
        } else {
            DOM.emptyState.querySelector('h3').textContent = 'Sin productos registrados';
            DOM.emptyState.querySelector('p').textContent = 'Escanea un código de barras o ingresa uno manualmente para comenzar';
        }
    } else {
        DOM.emptyState.classList.add('hidden');
        DOM.tableWrapper.classList.remove('hidden');
    }

    DOM.inventoryTbody.innerHTML = filtered.map((product, idx) => {
        const date = new Date(product.createdAt);
        const dateStr = date.toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
        const timeStr = date.toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
        });
        const priceStr = product.price
            ? `$${product.price.toFixed(2)}`
            : '—';
        const categoryHTML = product.category
            ? `<span class="category-badge">${getCategoryEmoji(product.category)} ${product.category}</span>`
            : '<span style="color:var(--text-muted)">—</span>';

        const photoHTML = product.photo
            ? `<img class="photo-thumb" src="${product.photo}" alt="${escapeHtml(product.name)}" onclick="viewPhoto('${product.id}')">`
            : `<div class="no-photo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

        return `
            <tr data-id="${product.id}">
                <td>${idx + 1}</td>
                <td class="td-photo">${photoHTML}</td>
                <td class="td-code">${escapeHtml(product.barcode)}</td>
                <td class="td-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</td>
                <td class="td-desc" title="${escapeHtml(product.description || '')}">${escapeHtml(product.description || '—')}</td>
                <td class="td-category">${categoryHTML}</td>
                <td class="td-quantity">${product.quantity}</td>
                <td class="td-price">${priceStr}</td>
                <td class="td-date">${dateStr}<br><small>${timeStr}</small></td>
                <td class="td-actions">
                    <button class="btn btn-ghost btn-icon" onclick="editProduct('${product.id}')" title="Editar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                        </svg>
                    </button>
                    <button class="btn btn-danger-outline btn-icon" onclick="deleteProduct('${product.id}')" title="Eliminar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ---- Export to Excel + ZIP ----
async function exportToExcel() {
    if (STATE.inventory.length === 0) {
        showToast('No hay productos para exportar', 'error');
        return;
    }

    try {
        if (typeof XLSX === 'undefined') {
            showToast('Error: La librería de Excel no se cargó.', 'error');
            return;
        }

        showToast('Generando archivo...', 'success');

        const hasPhotos = STATE.inventory.some(p => p.photo);

        // Prepare Excel data
        const data = STATE.inventory.map((p, idx) => {
            const row = {
                '#': idx + 1,
                'Código de Barras': p.barcode,
                'Nombre': p.name,
                'Descripción': p.description || '',
                'Categoría': p.category || '',
                'Cantidad': p.quantity,
                'Precio Unitario': p.price || 0,
                'Fecha de Registro': new Date(p.createdAt).toLocaleString('es-MX'),
            };
            if (hasPhotos) {
                row['Foto (archivo)'] = p.photo ? `fotos/${p.barcode}_${idx + 1}.jpg` : 'Sin foto';
            }
            return row;
        });

        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);

        // Set column widths
        const cols = [
            { wch: 5 },   // #
            { wch: 18 },  // Código
            { wch: 30 },  // Nombre
            { wch: 40 },  // Descripción
            { wch: 18 },  // Categoría
            { wch: 10 },  // Cantidad
            { wch: 15 },  // Precio
            { wch: 22 },  // Fecha
        ];
        if (hasPhotos) cols.push({ wch: 30 }); // Foto
        ws['!cols'] = cols;

        XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);

        if (hasPhotos && typeof JSZip !== 'undefined') {
            // Create ZIP with Excel + photos
            const zip = new JSZip();

            // Add Excel file to ZIP
            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            zip.file(`Inventario_Noor_${dateStr}.xlsx`, excelBuffer);

            // Add photos to ZIP
            const fotosFolder = zip.folder('fotos');
            STATE.inventory.forEach((p, idx) => {
                if (p.photo) {
                    // Convert base64 to binary
                    const base64Data = p.photo.split(',')[1];
                    fotosFolder.file(`${p.barcode}_${idx + 1}.jpg`, base64Data, { base64: true });
                }
            });

            // Generate and download ZIP
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const zipUrl = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = zipUrl;
            a.download = `Inventario_Noor_${dateStr}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(zipUrl);

            showToast(`ZIP con Excel + ${STATE.inventory.filter(p => p.photo).length} fotos descargado`, 'success');
        } else {
            // No photos or JSZip not available — just download Excel
            const filename = `Inventario_Noor_${dateStr}.xlsx`;
            XLSX.writeFile(wb, filename);
            showToast(`Archivo "${filename}" descargado exitosamente`, 'success');
        }
    } catch (err) {
        console.error('Export error:', err);
        showToast('Error al exportar. Intenta de nuevo.', 'error');
    }
}

// ---- Stats ----
function updateStats() {
    DOM.statTotal.textContent = STATE.inventory.length;

    const today = new Date().toDateString();
    const todayCount = STATE.inventory.filter(p =>
        new Date(p.createdAt).toDateString() === today
    ).length;
    DOM.statToday.textContent = todayCount;

    animateValue(DOM.statTotal);
    animateValue(DOM.statToday);
}

function animateValue(el) {
    el.style.transform = 'scale(1.3)';
    el.style.transition = 'transform 0.3s ease';
    setTimeout(() => {
        el.style.transform = 'scale(1)';
    }, 200);
}

// ---- Toast Notifications ----
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconSVG = type === 'success'
        ? '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        : '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

    toast.innerHTML = `${iconSVG}<span>${escapeHtml(message)}</span>`;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ---- Confirm Dialog ----
function showConfirmDialog(title, message, onConfirm) {
    DOM.confirmTitle.textContent = title;
    DOM.confirmMessage.textContent = message;
    DOM.confirmModal.classList.remove('hidden');

    const handleConfirm = () => {
        DOM.confirmModal.classList.add('hidden');
        cleanup();
        onConfirm();
    };

    const handleCancel = () => {
        DOM.confirmModal.classList.add('hidden');
        cleanup();
    };

    const cleanup = () => {
        DOM.confirmOk.removeEventListener('click', handleConfirm);
        DOM.confirmCancel.removeEventListener('click', handleCancel);
    };

    DOM.confirmOk.addEventListener('click', handleConfirm);
    DOM.confirmCancel.addEventListener('click', handleCancel);
}

// ---- Utility Functions ----
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

function getCategoryEmoji(category) {
    const emojis = {
        'Alimentos': '🍞',
        'Bebidas': '🥤',
        'Limpieza': '🧹',
        'Higiene Personal': '🧴',
        'Electrónica': '📱',
        'Ropa': '👕',
        'Papelería': '📝',
        'Hogar': '🏠',
        'Mascotas': '🐾',
        'Otro': '📦',
    };
    return emojis[category] || '📦';
}
