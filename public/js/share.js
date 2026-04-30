/* ============================================================
   Sharing — Web Share API (native share sheet) with WhatsApp deep
   link fallback. No Twilio / no paid API.
   ============================================================ */

const Share = (() => {
  // Country-code-aware: 10-digit local number → prepended with 91 so
  // wa.me opens the right chat directly instead of the contact-picker.
  const cleanPhone = (p) => Utils.normalizePhone(p);

  // Open native share sheet if available, otherwise fallback to WhatsApp deep link.
  const share = async ({ phone, text, title = 'FINBUDDY' }) => {
    const ph = cleanPhone(phone);
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return 'native';
      } catch (e) {
        // fall through to WhatsApp link
      }
    }
    return whatsappLink(ph, text);
  };

  // Always returns a wa.me URL — caller can open it for manual send.
  const whatsappLink = (phone, text) => {
    const ph = cleanPhone(phone);
    const url = ph
      ? `https://wa.me/${ph}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
    return 'whatsapp';
  };

  // SMS deep link
  const smsLink = (phone, text) => {
    const ph = cleanPhone(phone);
    const url = `sms:${ph}?body=${encodeURIComponent(text)}`;
    window.open(url, '_self');
  };

  // mailto fallback
  const emailLink = ({ to, subject, body }) => {
    const url = `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
    window.open(url, '_self');
  };

  // Build a polite settle-up message
  const settleMessage = ({ payerName, who, amount, title }) => {
    const symbol = '₹';
    return `Hey ${who || ''}, you owe ${symbol}${amount} for "${title || 'a shared expense'}". Please settle when you can.\n— ${payerName || 'me'} via FinBuddy`;
  };

  return { share, whatsappLink, smsLink, emailLink, settleMessage, cleanPhone };
})();
