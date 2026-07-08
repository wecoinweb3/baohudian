/**
 * This is a user authentication API route demo.
 * Handle user registration, login, token management, etc.
 */
import { Router, type Request, type Response } from 'express'
import { findUserByCredentials } from '../lib/auth.js'

const router = Router()

/**
 * User Login
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  // TODO: Implement register logic
})

/**
 * User Login
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const username = String(req.body.username || '').trim()
  const password = String(req.body.password || '').trim()

  if (!username || !password) {
    res.status(400).json({ success: false, error: '请输入账号和密码' })
    return
  }

  const user = findUserByCredentials(username, password)
  if (!user) {
    res.status(401).json({ success: false, error: '账号或密码不正确，请重新输入。' })
    return
  }

  res.json({ success: true, user })
})

/**
 * User Logout
 * POST /api/auth/logout
 */
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true })
})

export default router
