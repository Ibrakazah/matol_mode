import math,cmath,random
from scipy.optimize import brentq
def ang(P,Q,R): return abs(cmath.phase((P-Q)/(R-Q)))
def rot(v,t): return v*cmath.exp(1j*t)
def inter(P,u,Q,v):
    # P+s u = Q + t v
    M=[[u.real,-v.real],[u.imag,-v.imag]]; r=Q-P
    det=M[0][0]*M[1][1]-M[0][1]*M[1][0]
    s=(r.real*M[1][1]-M[0][1]*r.imag)/det
    return P+s*u
A=0j;B=1+0j
def config(C,phi):
    L=inter(A,cmath.exp(1j*phi),C,rot(A-C,-phi))  # C sees A; rotate toward inside
    # ensure L inside: check orientation sign choice
    D=inter(A,B-A,C,rot(B-C,phi))
    return L,D
def F(C,phi):
    L,D=config(C,phi); return abs(B-D)-abs(L-D)
cnt=0
for _ in range(20000):
    C=complex(random.uniform(-0.5,1.5),random.uniform(0.2,1.5))
    Aang=ang(B,A,C);Cang=ang(A,C,B)
    # check rotation directions by testing L inside
    phis=[i*min(Aang,Cang)/200 for i in range(1,200)]
    for p0,p1 in zip(phis,phis[1:]):
        try:
            if F(C,p0)*F(C,p1)<0:
                phi=brentq(lambda t:F(C,t),p0,p1)
                L,D=config(C,phi)
                g=ang(A,L,D)+ang(A,B,C)-math.pi
                res.append((C,phi,g,ang(B,L,C))) if 'res' in globals() else None
        except ZeroDivisionError: pass
