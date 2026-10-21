# MathTime roadmap

Decided 2026-10-21, after Level 1 shipped. This is the route from the first addition problem to upper-level physics. It fixes the order of the stages. What each level is, and when and how each idea is presented, is decided step by step as each stage is reached.

## 1. Destination
Upper-level physics, in four subjects:
- **Classical mechanics:** Lagrangian and Hamiltonian mechanics, oscillations, orbits, rigid bodies.
- **Electromagnetism:** Maxwell's equations, fields and potentials, electromagnetic waves.
- **Quantum mechanics:** the Schrödinger equation, operators, spin, the hydrogen atom.
- **Thermodynamics and statistical mechanics:** entropy, ensembles, partition functions.

The route therefore runs through all of school math and on through linear algebra, differential equations, vector calculus, complex numbers, Fourier analysis and probability. Relativity is not a destination for now.

## 2. Principles
- **Physics is interleaved.** Each physics topic (marked ⚛ below) comes as soon as the math it needs is in place, not all at the end. It gives the math a purpose, and the physics-specific problem skills (units, vectors, free-body diagrams) arrive gradually.
- **Small steps.** A level is one kind of problem, practised until it is solid, like Level 1. Each level adds one new idea, and the steps are as small as they can usefully be.
- **One piece at a time.** Levels are designed and built one at a time, in route order. Each gets its own spec, mockup and UI review before code (Level 1 spec §8). This roadmap does not spell out the levels inside a stage; they are worked out when the stage is reached.
- **The filling-out mechanic grows with the math.** Several topics need a new way of filling out a problem, such as carrying, long division, fractions, step-by-step equations, vectors and graphs. Each new mechanic is designed with the first level that needs it, to the same quality bar as Level 1.

## 3. The route

### Part I: Numbers
1. Whole numbers: +, −, × and ÷ facts, then the written methods (carrying, borrowing, long multiplication, long division) and order of operations
2. Fractions, decimals, percentages, ratios
3. Negative numbers, powers, roots, scientific notation
   - ⚛ Measurement: units, conversions, scientific notation in use

### Part II: Algebra
4. Expressions and linear equations, rearranging formulas
   - ⚛ Constant motion: distance, speed, time; density
5. Graphs and straight lines, slope
   - ⚛ Motion graphs: position-time, velocity-time
6. Systems of equations, inequalities, polynomials, quadratics
   - ⚛ Accelerated motion in one dimension, free fall

### Part III: Shape and direction
7. Geometry: angles, triangles, Pythagoras, circles, area, volume
8. Trigonometry: sine, cosine and tangent, radians, the unit circle, identities
9. Vectors: components, adding vectors, the dot product
   - ⚛ Motion in two dimensions: projectiles, circular motion
   - ⚛ Forces: Newton's laws, free-body diagrams, friction, inclines
   - ⚛ Energy and momentum (algebra-based), collisions
10. Functions, exponentials, logarithms
11. Complex numbers, polar form, Euler's formula

### Part IV: Calculus
12. Limits and derivatives
    - ⚛ Velocity and acceleration as derivatives
13. Integrals, series, Taylor expansions
    - ⚛ Work, centre of mass, rotation, gravitation and orbits
14. Ordinary differential equations
    - ⚛ Oscillations: simple, damped, driven
15. Multivariable calculus
    - ⚛ Fields and potentials, the ideal gas
16. Vector calculus: divergence, curl, the Gauss and Stokes theorems
    - ⚛ **Electromagnetism:** Gauss's and Ampère's laws, circuits, induction, Maxwell's equations

### Part V: Advanced
17. Linear algebra: matrices, eigenvalues, vector spaces
    - ⚛ Coupled oscillators, normal modes
18. Fourier analysis and partial differential equations
    - ⚛ Waves, including electromagnetic waves
19. Calculus of variations
    - ⚛ **Classical mechanics:** Lagrangian, Hamiltonian, orbits, rigid bodies
20. Probability and statistics
    - ⚛ **Thermodynamics and statistical mechanics**
21. Operators and Hilbert spaces (linear algebra, continued)
    - ⚛ **Quantum mechanics:** the Schrödinger equation, wells, the oscillator, spin, the hydrogen atom

## 4. Where we are
- **Done:** Stage 1, Level 1, single-digit addition (0–9 + 0–9), merged to `main`.
- **Next:** the rest of the whole-number facts: subtraction, multiplication and division. These are the first small steps. After them come the written methods, where the first multi-box filling-out mechanic appears. Each is designed as its own level.

## 5. Open, to decide when it comes up
- **The header's roadmap strip** shows 7 placeholder stages (Arithmetic, Fractions, Algebra, Geometry, Trigonometry, Calculus, Physics). It should follow this route. Whether it shows the parts, the stages or something else is a UI question for a later level.
- **The breadcrumb** reads "Arithmetic › Addition › Level 1". Its names should match whatever the strip shows.
