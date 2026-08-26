import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { hashPassword, verifyPassword, setSession, clearSession, requireUser } from "../auth.js";

const router=Router();
const credentials=z.object({email:z.string().email().max(320),password:z.string().min(8).max(200),name:z.string().min(1).max(100).optional()});

router.post("/register",async(req,res)=>{
  const p=credentials.parse(req.body);
  const count=(await db.query("SELECT count(*)::int AS n FROM users")).rows[0].n;
  const role=count===0?"admin":"member";
  try{
    const hash=await hashPassword(p.password);
    const r=await db.query("INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email,name,role",[p.email.toLowerCase(),p.name||p.email.split("@")[0],hash,role]);
    setSession(res,r.rows[0]); res.json({user:r.rows[0]});
  }catch{res.status(409).json({error:"Email already registered"});}
});
router.post("/login",async(req,res)=>{
  const p=credentials.pick({email:true,password:true}).parse(req.body);
  const r=await db.query("SELECT id,email,name,role,password_hash FROM users WHERE email=$1",[p.email.toLowerCase()]);
  if(!r.rows[0]||!(await verifyPassword(p.password,r.rows[0].password_hash))) return res.status(401).json({error:"Invalid email or password"});
  const {password_hash,...user}=r.rows[0]; setSession(res,user); res.json({user});
});
router.post("/logout",(req,res)=>{clearSession(res);res.json({ok:true})});
router.get("/me",requireUser,(req,res)=>res.json({user:req.user}));
export default router;
