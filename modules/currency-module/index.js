const API_BASE_PRIMARY = 'https://api.exchangerate.host';
const API_BASE_FALLBACK = 'https://open.er-api.com/v6/latest';
const API_SYMBOLS_ENDPOINT = 'https://api.exchangerate.host/symbols';
const EXCHANGE_API_KEY = process.env.EXCHANGERATE_API_KEY || process.env.CURRENCY_API_KEY || null;
const SYMBOL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const DEFAULT_CURRENCY_NAMES = {
  USD: 'Dólar estadounidense',
  EUR: 'Euro',
  ARS: 'Peso argentino',
  CLP: 'Peso chileno',
  BRL: 'Real brasileño',
  UYU: 'Peso uruguayo',
  PYG: 'Guaraní paraguayo',
  BOB: 'Boliviano',
  PEN: 'Sol peruano',
  MXN: 'Peso mexicano',
  COP: 'Peso colombiano',
  VES: 'Bolívar venezolano',
  CAD: 'Dólar canadiense',
  AUD: 'Dólar australiano',
  GBP: 'Libra esterlina',
  JPY: 'Yen japonés',
  CNY: 'Yuan chino',
  CHF: 'Franco suizo',
  UAH: 'Grivna ucraniana',
  RUB: 'Rublo ruso',
  CZK: 'Corona checa',
  HUF: 'Forinto húngaro',
  SEK: 'Corona sueca',
  NOK: 'Corona noruega',
  DKK: 'Corona danesa',
  ZAR: 'Rand sudafricano',
  INR: 'Rupia india',
  KRW: 'Won surcoreano',
  THB: 'Baht tailandés',
  SGD: 'Dólar de Singapur',
  HKD: 'Dólar de Hong Kong',
  TRY: 'Lira turca',
  ILS: 'Nuevo shekel israelí',
  PLN: 'Zloty polaco',
  TWD: 'Nuevo dólar taiwanés',
  PHP: 'Peso filipino',
  SAR: 'Riyal saudí',
  AED: 'Dirham de Emiratos',
  KWD: 'Dinar kuwaití',
  BHD: 'Dinar bahreiní',
  NZD: 'Dólar neozelandés'
};

let cachedSymbolsList = null;
let cachedSymbolsFetchedAt = 0;

const COUNTRY_TO_CURRENCY = {
  AR: 'ARS',
  US: 'USD',
  CL: 'CLP',
  BR: 'BRL',
  UY: 'UYU',
  PY: 'PYG',
  BO: 'BOB',
  PE: 'PEN',
  MX: 'MXN',
  CO: 'COP',
  VE: 'VES',
  EC: 'USD',
  GB: 'GBP',
  ES: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  IT: 'EUR',
  PT: 'EUR',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  JP: 'JPY',
  CN: 'CNY',
  CH: 'CHF'
};

function normalizeText(text = '') {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseConversionRequest(messageText = '') {
  let text = normalizeText(messageText);

  if (text.startsWith('convertir ')) {
    text = text.slice('convertir '.length);
  } else if (text.startsWith('convert ')) {
    text = text.slice('convert '.length);
  } else if (text.startsWith('conversión ') || text.startsWith('conversion ')) {
    text = text.replace(/^convers[ií]on\s+/i, '');
  }

  const match = text.match(
    /^([0-9]+(?:[.,][0-9]+)?)\s*([a-zA-Z]{3})\s*(?:a|en|to|=>|y)\s*([a-zA-Z]{3})(?:\s*(?:y|&)\s*([a-zA-Z]{3}))?$/
  );

  if (!match) {
    return null;
  }

  const amount = parseFloat(match[1].replace(',', '.'));
  const from = match[2].toUpperCase();
  const to = match[3].toUpperCase();
  const extra = match[4] ? match[4].toUpperCase() : null;

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return { amount, from, targets: extra ? [to, extra] : [to] };
}

async function convertCurrency(amount, from, to) {
  try {
    return await fetchFromPrimary(amount, from, to);
  } catch (primaryError) {
    if (shouldFallback(primaryError)) {
      return await fetchFromFallback(amount, from, to);
    }
    throw primaryError;
  }
}

async function fetchFromPrimary(amount, from, to) {
  const params = new URLSearchParams({
    from,
    to,
    amount: String(amount),
    places: '6'
  });

  if (EXCHANGE_API_KEY) {
    params.append('access_key', EXCHANGE_API_KEY);
  }

  const response = await fetch(`${API_BASE_PRIMARY}/convert?${params.toString()}`);
  if (!response.ok) {
    const error = new Error(`Error consultando tasas (${response.status})`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  if (!data || data.success === false) {
    const type = data?.error?.type || data?.error?.code || data?.error || 'unknown_error';
    const info = data?.error?.info || '';
    const message = type === 'unknown_error' ? (info || 'Respuesta inválida del servicio de conversión.') : type;
    const error = new Error(message);
    error.type = type;
    throw error;
  }

  return {
    rate: data.info?.rate ?? null,
    result: data.result ?? null,
    date: data.date ?? null
  };
}

async function fetchFromFallback(amount, from, to) {
  const response = await fetch(`${API_BASE_FALLBACK}/${encodeURIComponent(from)}`);
  if (!response.ok) {
    const error = new Error(`Error consultando tasas (fallback ${response.status})`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  if (!data || data.result !== 'success' || !data.rates?.[to]) {
    const errorType = data?.['error-type'] || 'fallback_unavailable';
    const error = new Error(errorType);
    error.type = errorType;
    throw error;
  }

  const rate = data.rates[to];
  const result = rate * amount;
  const date = data.time_last_update_utc || data.time_last_update_unix || null;

  return {
    rate,
    result,
    date
  };
}

function shouldFallback(error) {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  if (error.status === 401) return true;
  if (['missing_access_key', 'invalid_access_key', 'access_key'].some(token => message.includes(token))) {
    return true;
  }
  if (error.type && ['missing_access_key', 'invalid_access_key', 'invalid_access_key_type'].includes(error.type)) {
    return true;
  }
  return false;
}

function buildHelpMessage() {
  return `💱 *Conversor de monedas*\n\nPodés escribir directamente:\n• convertir 100 usd a ars\n• 50 eur a usd\n• 2500 clp a ars y usd (dos monedas a la vez)\n\nO usa la opción 6️⃣ del menú para ver sugerencias según tu ubicación.\n\n📚 Escribí *"monedas"* para listar las divisas disponibles.\n\nEscribí *"volver"* o *"menu"* para regresar.`;
}

function getUserProfile(db, userPhone) {
  const stmt = db.prepare(`
    SELECT 
      location_city,
      location_country,
      location_country_code,
      home_currency,
      home_country_code
    FROM users
    WHERE phone = ?
  `);
  return stmt.get(userPhone) || {};
}

function getCurrencyForCountry(countryCode) {
  if (!countryCode) return null;
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] || null;
}

function formatCurrencyNumber(value, fractionDigits = 2) {
  return Intl.NumberFormat('es-AR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}

function buildSuggestionsMessage({ localLabel, localCurrency, targets, homeCurrency, hasHomeCurrency }) {
  const lines = [];
  if (localLabel && localCurrency) {
    lines.push(`📍 Estoy detectando: *${localLabel}* (${localCurrency})`);
  }
  if (homeCurrency) {
    const sourceNote = hasHomeCurrency ? '' : ' (detectada automáticamente)';
    lines.push(`🏠 Tu moneda base es: *${homeCurrency}*${sourceNote}`);
  } else {
    lines.push('🏠 No configuraste una moneda base. Podés hacerlo con `base ARS`');
  }

  lines.push('\n✍️ Escribí el monto en tu moneda local y te doy las conversiones sugeridas.');
  lines.push('Ejemplo: `1500`\n');

  if (targets && targets.length) {
    lines.push('Convertiré tu monto a:');
    targets.forEach((target, index) => {
      lines.push(`${index + 1}️⃣ ${target}`);
    });
  }

  lines.push('\n🔄 Cambiá las monedas destino con `destinos USD EUR` (podés indicar hasta 3 códigos).');
  lines.push('💡 También podés escribir directamente `convertir 150 usd a eur` o `500 clp a ars y usd`.');
  lines.push('📚 Escribí *"monedas"* para ver las divisas disponibles.');
  lines.push('🔧 Configurá tu moneda base con `base ARS` (o cualquier código ISO).');
  lines.push('✖️ Escribí *"volver"* para regresar al menú.');

  return lines.join('\n');
}

function buildContext(params) {
  if (!params) return null;
  return JSON.stringify(params);
}

function parseStageContext(session) {
  if (!session?.context) return {};
  try {
    return JSON.parse(session.context);
  } catch (error) {
    return {};
  }
}

function setHomeCurrency(db, userPhone, currency, countryCode = null) {
  const stmt = db.prepare(`
    UPDATE users
    SET home_currency = ?, home_country_code = COALESCE(home_country_code, ?)
    WHERE phone = ?
  `);
  stmt.run(currency, countryCode, userPhone);
}

function setLocationCountry(db, userPhone, countryName, countryCode) {
  const stmt = db.prepare(`
    UPDATE users
    SET location_country = ?, location_country_code = ?
    WHERE phone = ?
  `);
  stmt.run(countryName, countryCode, userPhone);
}

async function handleMultiConversion(amount, from, targets) {
  const results = [];
  for (const target of targets) {
    if (target === from) continue;
    const conversion = await convertCurrency(amount, from, target);
    results.push({
      target,
      conversion
    });
  }
  return results;
}

function buildMultiConversionMessage(amount, from, results, localLabel) {
  const lines = [];
  lines.push('💱 *Conversión de Moneda*\n');
  lines.push(`🔢 ${formatCurrencyNumber(amount)} ${from}${localLabel ? ` (${localLabel})` : ''}\n`);

  results.forEach(({ target, conversion }) => {
    if (!conversion || conversion.result === null || conversion.rate === null) return;
    lines.push(`➡️ **${formatCurrencyNumber(conversion.result)} ${target}**`);
    lines.push(`   💹 1 ${from} = ${formatCurrencyNumber(conversion.rate, 6)} ${target}`);
    const formattedDate = formatRateTimestamp(conversion.date);
    if (formattedDate) {
      lines.push(`   📅 Tasa del ${formattedDate}`);
    }
    lines.push('');
  });

  lines.push('💡 Podés convertir otro monto o usar `convertir 100 usd a ars`.');
  lines.push('✖️ Escribí *"volver"* para regresar al menú.');

  return lines.join('\n');
}

async function fetchAvailableCurrencies() {
  const now = Date.now();
  if (cachedSymbolsList && (now - cachedSymbolsFetchedAt) < SYMBOL_CACHE_TTL_MS) {
    return cachedSymbolsList;
  }

  const symbols = [];
  const params = new URLSearchParams();
  if (EXCHANGE_API_KEY) {
    params.append('access_key', EXCHANGE_API_KEY);
  }

  try {
    const response = await fetch(`${API_SYMBOLS_ENDPOINT}${params.toString() ? `?${params.toString()}` : ''}`);
    if (response.ok) {
      const data = await response.json();
      if (data?.symbols && typeof data.symbols === 'object') {
        for (const [code, info] of Object.entries(data.symbols)) {
          symbols.push({
            code,
            name: info?.description || DEFAULT_CURRENCY_NAMES[code] || code
          });
        }
      }
    }
  } catch (error) {
    console.warn('[WARN] No se pudieron obtener símbolos desde exchangerate.host:', error.message);
  }

  if (!symbols.length) {
    for (const [code, name] of Object.entries(DEFAULT_CURRENCY_NAMES)) {
      symbols.push({ code, name });
    }
  }

  symbols.sort((a, b) => a.code.localeCompare(b.code));

  cachedSymbolsList = symbols;
  cachedSymbolsFetchedAt = now;
  return symbols;
}

function buildCurrenciesListMessage(symbols = [], { page = 1, pageSize = 25, showAll = false } = {}) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return '❌ No pude obtener la lista de monedas disponibles en este momento. Intenta más tarde.';
  }

  const total = symbols.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!showAll) {
    page = Math.min(Math.max(1, page), totalPages);
  }

  const items = showAll
    ? symbols
    : symbols.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  const list = items
    .map(entry => `• *${entry.code}* - ${entry.name}`)
    .join('\n');

  let footer = '\n💡 Usá el código ISO (ej: USD, EUR, CLP) en tus conversiones.';
  footer += '\n🔄 Cambiá las monedas destino con `destinos USD EUR`.';
  footer += '\n✖️ Escribí *"volver"* para regresar al menú.';

  if (!showAll && totalPages > 1) {
    footer += `\n\n📄 Página ${page} de ${totalPages}.`;
    footer += '\n➡️ Escribí `monedas 2` o cualquier número para moverte, o `monedas todo` para ver la lista completa.';
  }

  return `🌍 *Divisas disponibles*\n\n${list}${footer}`;
}

function capitalize(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatRateTimestamp(value) {
  if (!value) return null;

  let date = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    // Some services return unix timestamps in seconds
    date = value > 1e12 ? new Date(value) : new Date(value * 1000);
  } else if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      date = new Date(parsed);
    }
  }

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  const dateFormatter = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const timeFormatter = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  });

  const datePart = capitalize(dateFormatter.format(date).replace(/,/g, ''));
  const timePart = timeFormatter.format(date);

  return `${datePart} - ${timePart}`;
}

function buildConversionErrorMessage(error) {
  const baseMessage = '❌ No pude obtener la tasa de cambio en este momento.';

  if (!error || !error.message) {
    return `${baseMessage}\n\nIntenta nuevamente en unos segundos.`;
  }

  if (shouldFallback(error)) {
    return `${baseMessage}\n\n⚠️ El servicio principal devolvió un error de autenticación. Probé un servicio alternativo pero tampoco respondió correctamente. Intenta más tarde o, si tenés una API key, agregala a tu archivo .env como \`EXCHANGERATE_API_KEY\` y reiniciá el bot.`;
  }

  return `${baseMessage}\n\nDetalles: ${error.message}`;
}

function getLocalCurrencyInfo(db, userPhone) {
  const profile = getUserProfile(db, userPhone);
  const localCurrency = profile.location_country_code
    ? getCurrencyForCountry(profile.location_country_code)
    : null;
  const localLabelParts = [];
  if (profile.location_city) localLabelParts.push(profile.location_city);
  if (profile.location_country) localLabelParts.push(profile.location_country);
  const localLabel = localLabelParts.join(', ');

  return {
    profile,
    localCurrency,
    localLabel,
    localCountryCode: profile.location_country_code || null
  };
}

function buildTargets(localCurrency, homeCurrency) {
  const targets = [];
  if (homeCurrency && homeCurrency !== localCurrency) {
    targets.push(homeCurrency);
  }
  if (localCurrency !== 'USD') {
    targets.push('USD');
  }
  if (!targets.length) {
    targets.push('USD');
  }
  return Array.from(new Set(targets));
}

function startCurrencyFlow(db, userPhone) {
  const { profile, localCurrency, localLabel, localCountryCode } = getLocalCurrencyInfo(db, userPhone);
  const defaultHome = profile.home_currency || (localCurrency && localCurrency !== 'ARS' ? 'ARS' : localCurrency || 'ARS');

  if (!profile.home_currency && defaultHome) {
    setHomeCurrency(db, userPhone, defaultHome, profile.home_country_code || localCountryCode || null);
  }

  const homeCurrency = profile.home_currency || defaultHome || null;
  const targets = buildTargets(localCurrency, homeCurrency);

  const message = buildSuggestionsMessage({
    localLabel: localLabel || (localCurrency ? `País detectado (${localCurrency})` : null),
    localCurrency,
    targets,
    homeCurrency,
    hasHomeCurrency: Boolean(profile.home_currency)
  });

  const context = {
    stage: 'await_amount',
    localCurrency,
    localLabel,
    targets,
    homeCurrency,
    hasHomeCurrency: Boolean(profile.home_currency),
    localCountryCode
  };

  return {
    message,
    context: buildContext(context)
  };
}

async function handleCurrencyMessage(db, userPhone, userName, messageText, session) {
  const normalized = normalizeText(messageText);
  if (['volver', 'menu', 'menú'].includes(normalized)) {
    return { exit: true };
  }

  const stageContext = parseStageContext(session);

  const isMonedasCommand =
    normalized === 'monedas' ||
    normalized.startsWith('monedas ') ||
    normalized === 'listar monedas' ||
    normalized === 'todas las monedas';

  if (isMonedasCommand) {
    let page = 1;
    let showAll = false;

    if (normalized.startsWith('monedas ')) {
      const [, arg] = normalized.split(' ', 2);
      if (arg === 'todo' || arg === 'todas') {
        showAll = true;
      } else {
        const parsed = parseInt(arg, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          page = parsed;
        }
      }
    } else if (normalized === 'todas las monedas') {
      showAll = true;
    }

    const symbols = await fetchAvailableCurrencies();
    const message = buildCurrenciesListMessage(symbols, { page, showAll });
    return {
      message,
      context: session?.context || null
    };
  }

  if (normalized.startsWith('destinos ') || normalized.startsWith('objetivos ')) {
    const remainder = normalized.replace(/^destinos\s+/, '').replace(/^objetivos\s+/, '');
    const codes = remainder
      .split(/[\s,;]+/)
      .map(code => code.trim().toUpperCase())
      .filter(code => code.length);

    if (codes.length === 0) {
      return {
        message: '❌ Necesito que indiques al menos una moneda destino. Ejemplo: `destinos USD EUR`.',
        context: session?.context || null
      };
    }

    const invalidCodes = codes.filter(code => !/^[A-Z]{3}$/.test(code));
    if (invalidCodes.length) {
      return {
        message: `❌ Código(s) inválido(s): ${invalidCodes.join(', ')}.\n\nUsá códigos ISO de tres letras (ej: USD, EUR, CLP).`,
        context: session?.context || null
      };
    }

    let activeContext = stageContext && stageContext.stage ? JSON.parse(JSON.stringify(stageContext)) : null;

    if (!activeContext || !activeContext.stage) {
      const restarted = startCurrencyFlow(db, userPhone);
      activeContext = restarted.context ? JSON.parse(restarted.context) : { stage: 'await_amount' };
      activeContext.localCurrency = activeContext.localCurrency || null;
      activeContext.localLabel = activeContext.localLabel || null;
      activeContext.homeCurrency = activeContext.homeCurrency || null;
      activeContext.hasHomeCurrency = Boolean(activeContext.hasHomeCurrency);
    }

    const uniqueTargets = Array.from(new Set(codes));
    activeContext.targets = uniqueTargets;

    const summary = buildSuggestionsMessage({
      localLabel: activeContext.localLabel || null,
      localCurrency: activeContext.localCurrency || null,
      targets: activeContext.targets,
      homeCurrency: activeContext.homeCurrency || null,
      hasHomeCurrency: Boolean(activeContext.hasHomeCurrency)
    });

    return {
      message: `✅ Monedas destino actualizadas: *${uniqueTargets.join(', ')}*\n\n${summary}`,
      context: JSON.stringify(activeContext)
    };
  }

  if (normalized.startsWith('base ')) {
    const currency = normalized.slice(5).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return {
        message: '❌ Moneda inválida. Asegurate de usar el código ISO de tres letras (ej: ARS, USD, EUR).',
        context: session?.context || null
      };
    }
    setHomeCurrency(db, userPhone, currency);
    const restart = startCurrencyFlow(db, userPhone);
    return {
      message: `✅ Moneda base configurada en *${currency}*.\n\n${restart.message}`,
      context: restart.context
    };
  }

  const parsed = parseConversionRequest(messageText);
  if (parsed) {
    try {
      const results = await handleMultiConversion(parsed.amount, parsed.from, parsed.targets);
      const message = buildMultiConversionMessage(parsed.amount, parsed.from, results, null);
      
      // Trackear conversión de moneda (si el módulo de stats está disponible)
      try {
        const statsModule = require('../../modules/stats-module');
        results.forEach(({ target, conversion }) => {
          if (conversion && conversion.result !== null && conversion.rate !== null) {
            statsModule.trackCurrencyConversion(db, userPhone, {
              from: parsed.from,
              to: target,
              amount: parsed.amount,
              result: conversion.result,
              rate: conversion.rate,
              targetCount: parsed.targets.length
            });
          }
        });
      } catch (error) {
        console.warn('[WARN] No se pudo trackear conversión de moneda:', error.message);
      }
      
      return {
        message,
        context: session?.context || null
      };
    } catch (error) {
      return {
        message: buildConversionErrorMessage(error),
        context: session?.context || null
      };
    }
  }

  if (stageContext.stage === 'await_amount') {
    const amount = parseFloat(messageText.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        message: `❌ Necesito un número válido.\n\n${buildHelpMessage()}`,
        context: session?.context || null
      };
    }

    const localCurrency = stageContext.localCurrency || 'USD';
    const targets = stageContext.targets || ['USD'];
    try {
      const results = await handleMultiConversion(amount, localCurrency, targets);
      const message = buildMultiConversionMessage(amount, localCurrency, results, stageContext.localLabel);

      // Trackear conversión de moneda (si el módulo de stats está disponible)
      try {
        const statsModule = require('../../modules/stats-module');
        results.forEach(({ target, conversion }) => {
          if (conversion && conversion.result !== null && conversion.rate !== null) {
            statsModule.trackCurrencyConversion(db, userPhone, {
              from: localCurrency,
              to: target,
              amount: amount,
              result: conversion.result,
              rate: conversion.rate,
              targetCount: targets.length
            });
          }
        });
      } catch (error) {
        console.warn('[WARN] No se pudo trackear conversión de moneda:', error.message);
      }

      return {
        message,
        context: session?.context || null
      };
    } catch (error) {
      return {
        message: buildConversionErrorMessage(error),
        context: session?.context || null
      };
    }
  }

  return {
    message: buildHelpMessage(),
    context: session?.context || null
  };
}

module.exports = {
  startCurrencyFlow,
  handleCurrencyMessage,
  buildHelpMessage,
  parseConversionRequest,
  getCurrencyForCountry,
  setHomeCurrency,
  setLocationCountry
};

