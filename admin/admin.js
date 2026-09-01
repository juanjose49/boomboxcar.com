(() => {
  const loginPanel = document.getElementById('loginPanel');
  const loginForm = document.getElementById('loginForm');
  const loginStatus = document.getElementById('loginStatus');
  const adminContent = document.getElementById('adminContent');
  const signOut = document.getElementById('signOut');
  const partnerList = document.getElementById('partnerList');
  const partnerForm = document.getElementById('partnerForm');
  const saveStatus = document.getElementById('saveStatus');
  const sharePanel = document.getElementById('sharePanel');
  const redemptionStatus = document.getElementById('redemptionStatus');
  const couponList = document.getElementById('couponList');
  const couponForm = document.getElementById('couponForm');
  const couponStatus = document.getElementById('couponStatus');
  let authorization = '';
  let partners = [];
  let editingCode = '';
  let coupons = [];
  let editingCouponCode = '';
  let qrObjectUrl = '';

  function dateAfter(days) {
    return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  }

  function setStatus(element, message, state = '') {
    element.textContent = message;
    element.dataset.state = state;
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: { Accept: 'application/json', Authorization: authorization, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || 'The administrator request failed.');
    return payload;
  }

  function resetForm() {
    editingCode = '';
    partnerForm.reset();
    partnerForm.elements.code.readOnly = false;
    partnerForm.elements.futureDiscountPercent.value = '15';
    partnerForm.elements.newCustomerDiscountPercent.value = '10';
    partnerForm.elements.minHours.value = '1';
    partnerForm.elements.maxHours.value = '2';
    partnerForm.elements.newCustomerOfferEndsOn.value = dateAfter(14);
    partnerForm.elements.expiresOn.value = dateAfter(365);
    partnerForm.elements.active.checked = true;
    document.getElementById('editorMode').textContent = 'New partner';
    redemptionStatus.hidden = true;
    sharePanel.hidden = true;
    setStatus(saveStatus, '');
    renderList();
  }

  function renderList() {
    partnerList.replaceChildren(...partners.map(partner => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'partner-card';
      button.setAttribute('aria-current', String(partner.code === editingCode));
      const name = document.createElement('strong');
      name.textContent = partner.name;
      const details = document.createElement('span');
      details.textContent = `${partner.code} · ${partner.active ? partner.redemptionStatus : 'inactive'}`;
      button.append(name, details);
      button.addEventListener('click', () => editPartner(partner));
      return button;
    }));
    if (!partners.length) {
      const empty = document.createElement('p');
      empty.className = 'field-note';
      empty.textContent = 'No partners yet. Create the first one.';
      partnerList.append(empty);
    }
  }

  async function showShare(partner) {
    document.getElementById('privateUrl').value = partner.privateUrl;
    document.getElementById('qrDestinationUrl').value = partner.qrDestinationUrl;
    document.getElementById('qrUsageCopy').textContent = `Place this QR on BoomBoxCar signage during ${partner.name}'s activation. Customers land at the top of the public site, see an estimated ${partner.newCustomerDiscountPercent}% new-customer discount, and can verify it by email before booking through ${partner.newCustomerOfferEndsOn}. Visits and completed bookings retain campaign ${partner.qrCampaignId}. The private partner link is not encoded in this QR.`;
    const preview = document.getElementById('qrPreview');
    const download = document.getElementById('downloadQr');
    const qrStatus = document.getElementById('qrStatus');
    if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
    qrObjectUrl = '';
    preview.removeAttribute('src');
    preview.hidden = true;
    download.removeAttribute('href');
    download.hidden = true;
    sharePanel.hidden = false;
    if (!partner.active) {
      setStatus(qrStatus, 'Activate this partner before downloading the customer QR.', 'error');
      return;
    }
    setStatus(qrStatus, 'Generating the authenticated customer QR…');
    try {
      const qrUrl = new URL(partner.qrImageUrl);
      if (qrUrl.origin !== location.origin) throw new Error('The QR endpoint is invalid.');
      const response = await fetch(qrUrl.pathname, { headers: { Accept: 'image/svg+xml', Authorization: authorization } });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error?.message || 'The customer QR could not be generated.');
      }
      qrObjectUrl = URL.createObjectURL(await response.blob());
      preview.src = qrObjectUrl;
      preview.hidden = false;
      download.href = qrObjectUrl;
      download.hidden = false;
      setStatus(qrStatus, 'Ready to download for BoomBoxCar event signage.', 'success');
    } catch (error) {
      setStatus(qrStatus, error.message, 'error');
    }
  }

  function editPartner(partner) {
    editingCode = partner.code;
    for (const [field, value] of Object.entries(partner)) {
      if (partnerForm.elements[field] && typeof value !== 'object') partnerForm.elements[field].value = value ?? '';
    }
    for (const [field, value] of Object.entries(partner.venueAddress)) partnerForm.elements[field].value = value;
    partnerForm.elements.active.checked = partner.active;
    partnerForm.elements.code.readOnly = true;
    document.getElementById('editorMode').textContent = 'Edit partner';
    redemptionStatus.textContent = partner.redemptionStatus;
    redemptionStatus.hidden = false;
    void showShare(partner);
    setStatus(saveStatus, '');
    renderList();
  }

  function formPayload() {
    const fields = partnerForm.elements;
    return {
      code: fields.code.value.trim().toUpperCase(),
      name: fields.name.value.trim(),
      venueAddress: {
        addressLine1: fields.addressLine1.value.trim(), addressLine2: fields.addressLine2.value.trim(),
        locality: fields.locality.value.trim(), administrativeDistrictLevel1: fields.administrativeDistrictLevel1.value,
        postalCode: fields.postalCode.value.trim()
      },
      minHours: Number(fields.minHours.value), maxHours: Number(fields.maxHours.value),
      futureDiscountPercent: Number(fields.futureDiscountPercent.value),
      newCustomerDiscountPercent: Number(fields.newCustomerDiscountPercent.value),
      newCustomerOfferEndsOn: fields.newCustomerOfferEndsOn.value, expiresOn: fields.expiresOn.value,
      sourceReferralId: fields.sourceReferralId.value.trim(), qrCampaignId: fields.qrCampaignId.value.trim(),
      active: fields.active.checked
    };
  }

  async function loadPartners() {
    const payload = await api('/admin/partners');
    partners = payload.partners;
    renderList();
  }

  function resetCouponForm() {
    editingCouponCode = '';
    couponForm.reset();
    couponForm.elements.code.readOnly = false;
    couponForm.elements.type.value = 'PERCENT';
    couponForm.elements.value.value = '10';
    couponForm.elements.active.checked = true;
    document.getElementById('couponEditorMode').textContent = 'New coupon';
    updateCouponValueRules();
    setStatus(couponStatus, '');
    renderCouponList();
  }

  function renderCouponList() {
    couponList.replaceChildren(...coupons.map(coupon => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'partner-card';
      button.setAttribute('aria-current', String(coupon.code === editingCouponCode));
      const code = document.createElement('strong');
      code.textContent = coupon.code;
      const details = document.createElement('span');
      details.textContent = `${coupon.type === 'PERCENT' ? `${coupon.value}%` : `$${coupon.value}`} · ${coupon.active ? 'active' : 'inactive'}`;
      button.append(code, details);
      button.addEventListener('click', () => editCoupon(coupon));
      return button;
    }));
    if (!coupons.length) {
      const empty = document.createElement('p');
      empty.className = 'field-note';
      empty.textContent = 'No coupons yet. Create the first one.';
      couponList.append(empty);
    }
  }

  function editCoupon(coupon) {
    editingCouponCode = coupon.code;
    couponForm.elements.code.value = coupon.code;
    couponForm.elements.code.readOnly = true;
    couponForm.elements.type.value = coupon.type;
    couponForm.elements.value.value = String(coupon.value);
    couponForm.elements.active.checked = coupon.active;
    document.getElementById('couponEditorMode').textContent = 'Edit coupon';
    updateCouponValueRules();
    setStatus(couponStatus, '');
    renderCouponList();
  }

  function updateCouponValueRules() {
    const fixed = couponForm.elements.type.value === 'FIXED';
    couponForm.elements.value.max = fixed ? '10000' : '100';
    document.getElementById('couponValueNote').textContent = fixed
      ? 'Enter the discount in US dollars, up to $10,000. The coupon must leave at least $0.01 due.'
      : 'Percentage values may be up to 100. A 100% test coupon leaves $0.01 due.';
  }

  async function loadCoupons() {
    const payload = await api('/admin/coupons');
    coupons = payload.coupons;
    renderCouponList();
  }

  async function loadAdministration() {
    await Promise.all([loadPartners(), loadCoupons()]);
  }

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const username = loginForm.elements.username.value;
    const password = loginForm.elements.password.value;
    authorization = `Basic ${btoa(`${username}:${password}`)}`;
    setStatus(loginStatus, 'Signing in…');
    try {
      await loadAdministration();
      loginForm.elements.password.value = '';
      loginPanel.hidden = true;
      adminContent.hidden = false;
      signOut.hidden = false;
      resetForm();
      resetCouponForm();
    } catch (error) {
      authorization = '';
      setStatus(loginStatus, error.message, 'error');
    }
  });

  partnerForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = partnerForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus(saveStatus, 'Saving…');
    try {
      const wasEditing = Boolean(editingCode);
      const payload = formPayload();
      const result = await api(editingCode ? `/admin/partners/${encodeURIComponent(editingCode)}` : '/admin/partners', {
        method: editingCode ? 'PUT' : 'POST', body: JSON.stringify(payload)
      });
      await loadPartners();
      const saved = partners.find(partner => partner.code === result.partner.code) || result.partner;
      editPartner(saved);
      setStatus(saveStatus, wasEditing ? 'Partner updated.' : 'Partner created.', 'success');
    } catch (error) { setStatus(saveStatus, error.message, 'error'); }
    finally { submitButton.disabled = false; }
  });

  partnerForm.elements.code.addEventListener('input', event => {
    const code = event.target.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    event.target.value = code;
    if (!editingCode) {
      partnerForm.elements.sourceReferralId.value = code;
      partnerForm.elements.qrCampaignId.value = code ? `${code}-EVENT` : '';
    }
  });

  couponForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = couponForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus(couponStatus, 'Saving…');
    try {
      const wasEditing = Boolean(editingCouponCode);
      const payload = {
        code: couponForm.elements.code.value.trim().toUpperCase(), type: couponForm.elements.type.value,
        value: Number(couponForm.elements.value.value), active: couponForm.elements.active.checked
      };
      const result = await api(editingCouponCode ? `/admin/coupons/${encodeURIComponent(editingCouponCode)}` : '/admin/coupons', {
        method: editingCouponCode ? 'PUT' : 'POST', body: JSON.stringify(payload)
      });
      await loadCoupons();
      editCoupon(coupons.find(coupon => coupon.code === result.coupon.code) || result.coupon);
      setStatus(couponStatus, wasEditing ? 'Coupon updated.' : 'Coupon created.', 'success');
    } catch (error) { setStatus(couponStatus, error.message, 'error'); }
    finally { submitButton.disabled = false; }
  });

  couponForm.elements.code.addEventListener('input', event => {
    event.target.value = event.target.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  });
  couponForm.elements.type.addEventListener('change', updateCouponValueRules);

  document.getElementById('newPartner').addEventListener('click', resetForm);
  document.getElementById('newCoupon').addEventListener('click', resetCouponForm);
  document.getElementById('resetPartner').addEventListener('click', () => {
    const partner = partners.find(item => item.code === editingCode);
    if (partner) editPartner(partner); else resetForm();
  });
  document.getElementById('resetCoupon').addEventListener('click', () => {
    const coupon = coupons.find(item => item.code === editingCouponCode);
    if (coupon) editCoupon(coupon); else resetCouponForm();
  });
  signOut.addEventListener('click', () => {
    if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
    qrObjectUrl = '';
    authorization = '';
    partners = [];
    coupons = [];
    editingCode = '';
    editingCouponCode = '';
    adminContent.hidden = true;
    signOut.hidden = true;
    loginPanel.hidden = false;
    setStatus(loginStatus, 'Signed out.', 'success');
  });
  document.querySelectorAll('.copy-button').forEach(button => button.addEventListener('click', async () => {
    const input = document.getElementById(button.dataset.copy);
    try { await navigator.clipboard.writeText(input.value); button.textContent = 'Copied'; }
    catch (_) { input.select(); button.textContent = 'Select and copy'; }
    setTimeout(() => { button.textContent = 'Copy'; }, 1600);
  }));

  resetForm();
  resetCouponForm();
})();
