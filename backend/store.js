import { MongoClient } from 'mongodb';

let client;
let users;
export async function initializeStore() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 10 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'secure_auth');
    await db.command({ ping: 1 });
    users = db.collection('users');
    await users.createIndex({emailIndex: 1}, {unique: true, name: 'unique_email_index'});
    await users.createIndex({id: 1}, {unique: true, name: 'unique_user_id'});
    console.log(`MongoDB connected: ${db.databaseName}`);
  } catch (error) {
    await client.close();
    throw new Error(`MongoDB connection failed (${error.name}). Check MONGODB_URI and the MongoDB service.`);
  }
}
export async function closeStore() { if (client) await client.close(); }
export function findUserByEmailIndex(emailIndex) { return users.findOne({emailIndex}); }
export function findUserById(id) { return users.findOne({id}); }
export function readUsers() { return users.find({}, {projection:{_id:0}}).toArray(); }
export async function createUser(user) {
  try { await users.insertOne({...user}); return true; }
  catch (error) { if (error.code === 11000) return false; throw error; }
}
