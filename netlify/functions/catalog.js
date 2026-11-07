const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'sushi-mir-catalog';
const CATALOG_KEY = 'products';
const FALLBACK_ADMIN_PASSWORD = 'adminadmin123mir.com';

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(204, {});

  try {
    const store = getStore(STORE_NAME);

    if (event.httpMethod === 'GET') {
      const products = await store.get(CATALOG_KEY, { type: 'json' });
      // Порожній каталог відрізняємо від ще не ініціалізованого.
      return response(200, { products: Array.isArray(products) ? products : null });
    }

    if (event.httpMethod !== 'POST') {
      return response(405, { error: 'Метод не підтримується' });
    }

    const expectedPassword = process.env.ADMIN_PASSWORD || FALLBACK_ADMIN_PASSWORD;
    const suppliedPassword = event.headers?.['x-admin-password'] || event.headers?.['X-Admin-Password'] || '';
    if (!suppliedPassword || suppliedPassword !== expectedPassword) {
      return response(401, { error: 'Неправильний пароль адміністратора' });
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return response(400, { error: 'Некоректні дані запиту' });
    }

    if (!Array.isArray(body.products)) {
      return response(400, { error: 'Список товарів має бути масивом' });
    }
    if (body.products.length > 500) {
      return response(413, { error: 'Забагато товарів у каталозі' });
    }

    const cleanProducts = [];
    const ids = new Set();
    for (const item of body.products) {
      if (!item || typeof item !== 'object') return response(400, { error: 'Некоректний товар у каталозі' });
      const id = String(item.id || '').trim();
      const name = String(item.name || '').trim();
      const category = String(item.category || '').trim();
      const description = String(item.description || '').trim();
      const price = Number(item.price);
      const weight = Number(item.weight);
      const image = String(item.image || '');

      if (!id || !name || !category || !description || !Number.isFinite(price) || price <= 0 || !Number.isFinite(weight) || weight <= 0) {
        return response(400, { error: 'Перевірте назву, категорію, опис, ціну та вагу товару' });
      }
      if (ids.has(id)) return response(400, { error: 'Знайдено товари з однаковим ID' });
      if (image.length > 5_000_000) return response(413, { error: 'Зображення завелике' });
      ids.add(id);
      cleanProducts.push({ id, name, category, description, price, weight, image });
    }

    await store.setJSON(CATALOG_KEY, cleanProducts);
    return response(200, { ok: true, products: cleanProducts });
  } catch (error) {
    console.error('Catalog function error:', error);
    return response(500, { error: 'Помилка спільного сховища Netlify. Перевірте deploy та налаштування Netlify Blobs.' });
  }
};
