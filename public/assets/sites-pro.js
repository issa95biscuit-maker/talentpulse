/* Formulaire « Être recontacté » — envoi JSON, repli HTML natif si ce script ne s’exécute pas. */
(function () {
  'use strict';
  var form = document.getElementById('leadForm');
  if (!form) return;
  var status = document.getElementById('leadStatus');
  var btn = document.getElementById('leadSubmit');
  var planSel = document.getElementById('leadPlan');

  document.querySelectorAll('[data-plan]').forEach(function (a) {
    a.addEventListener('click', function () {
      if (planSel && a.getAttribute('data-plan')) planSel.value = a.getAttribute('data-plan');
    });
  });

  function setErr(name, msg) {
    var input = form.elements[name];
    var hint = document.getElementById('err-' + name);
    if (input && input.setAttribute) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (hint) {
      hint.textContent = msg || '';
      hint.classList.toggle('err', !!msg);
    }
  }

  function showStatus(kind, text) {
    if (!status) return;
    status.hidden = false;
    status.className = 'notice ' + (kind === 'ok' ? 'notice-ok' : 'notice-err');
    status.setAttribute('role', kind === 'ok' ? 'status' : 'alert');
    status.textContent = text;
    status.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ['name', 'email', 'activity', 'message', 'plan', 'consent'].forEach(function (n) { setErr(n, ''); });
    var data = {
      name: form.elements.name.value,
      email: form.elements.email.value,
      activity: form.elements.activity.value,
      message: form.elements.message.value,
      plan: form.elements.plan.value,
      consent: !!(form.elements.consent && form.elements.consent.checked),
      website: form.elements.website ? form.elements.website.value : ''
    };
    var label = btn.textContent;
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.textContent = 'Envoi…';
    form.setAttribute('aria-busy', 'true');
    fetch('/api/sites-pro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { res: res, body: body }; });
    }).then(function (r) {
      if (r.res.ok && r.body && r.body.ok) {
        form.reset();
        showStatus('ok', 'Votre demande est enregistrée. Vous serez recontacté à l’adresse indiquée. Aucun e-mail automatique n’a été envoyé.');
        return;
      }
      var fields = r.body && r.body.error && r.body.error.fields;
      if (fields && typeof fields === 'object') {
        Object.keys(fields).forEach(function (k) { setErr(k, fields[k]); });
        var first = form.querySelector('[aria-invalid="true"]');
        if (first && first.focus) first.focus();
      }
      var msg = (r.body && r.body.error && r.body.error.message) || 'La demande n’a pas pu être envoyée. Réessayez.';
      showStatus('err', msg);
    }).catch(function () {
      showStatus('err', 'La demande n’a pas pu être envoyée. Vérifiez votre connexion et réessayez.');
    }).then(function () {
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');
      btn.textContent = label;
      form.removeAttribute('aria-busy');
    });
  });
})();
