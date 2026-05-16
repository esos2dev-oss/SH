import bcrypt from 'bcrypt';
import { pool, closePool } from '../src/shared/config/db.js';

const EMAIL = 'admin@hotel.local';
const PASSWORD = 'Admin1234';
const NOMBRE = 'Admin';

const hash = await bcrypt.hash(PASSWORD, 12);

const { rows } = await pool.query(
  `INSERT INTO users (nombre, email, password_hash, role, active)
   VALUES ($1, $2, $3, 'superadmin', true)
   ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         active = true,
         set_password_token = NULL,
         set_password_expires = NULL,
         updated_at = NOW()
   RETURNING id, email, role, active`,
  [NOMBRE, EMAIL, hash],
);

console.log('OK admin:', rows[0]);
console.log('Email:   ', EMAIL);
console.log('Password:', PASSWORD);
await closePool();
