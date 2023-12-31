import dotenv from 'dotenv';
dotenv.config();

export const EDIT_ROUTE = 'edit';
export const CREATE_ROUTE = 'create';
export const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT}`;