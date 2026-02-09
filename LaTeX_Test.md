# LaTeX 渲染压力测试 (MathJax SVG Fix Verification)

## 1. 根号测试 (主要修复点)

- **基本根号**:
  $$ \sqrt{x} $$
  $$ \sqrt{2} \approx 1.414 $$

- **复杂根号 (分数与长表达式)**:
  $$ x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a} $$
  $$ \sqrt{1 + \sqrt{1 + \sqrt{1 + \sqrt{1 + \dots}}}} $$

- **立方根与高次根**:
  $$ \sqrt[3]{x^3 + y^3} \neq x+y $$
  $$ \sqrt[n]{1+x} \approx 1 + \frac{x}{n} $$

## 2. 积分与求和 (SVG 路径测试)

- **定积分 (上下限)**:
  $$ \int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi} $$
  $$ \int_a^b f(x) dx = F(b) - F(a) $$

- **多重积分**:
  $$ \iint_D f(x,y) dx dy $$
  $$ \oint_C \vec{F} \cdot d\vec{r} $$

- **求和与极限**:
  $$ \sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6} $$
  $$ \lim_{x \to 0} \frac{\sin x}{x} = 1 $$

## 3. 装饰线与框 (Rect/Line 元素测试)

- **上划线与下划线 (Overline/Underline)**:
  $$ \overline{x+y} = \overline{x} + \overline{y} $$
  $$ \underline{a \land b} $$

- **向量箭头 (Vectors)**:
  $$ \vec{a} \cdot \vec{b} = |\vec{a}| |\vec{b}| \cos \theta $$
  $$ \overrightarrow{AB} $$

- **盒子 (Boxed - 使用 Rect)**:
  $$ \boxed{E = mc^2} $$
  $$ \boxed{\int x dx = \frac{x^2}{2} + C} $$

## 4. 矩阵与多行公式 (复杂布局)

- **矩阵 (Bracket Scaling)**:
  $$
  A = \begin{pmatrix}
  a & b \\
  c & d
  \end{pmatrix}, \quad
  B = \begin{bmatrix}
  1 & 0 & 0 \\
  0 & 1 & 0 \\
  0 & 0 & 1
  \end{bmatrix}
  $$

- **分段函数 (Cases)**:
  $$
  f(x) = \begin{cases}
  x^2 & \text{if } x > 0 \\
  0 & \text{if } x = 0 \\
  -x^2 & \text{if } x < 0
  \end{cases}
  $$

- **对齐环境 (Align)**:
  $$
  \begin{aligned}
  (a+b)^2 &= (a+b)(a+b) \\
          &= a^2 + ab + ba + b^2 \\
          &= a^2 + 2ab + b^2
  \end{aligned}
  $$

## 5. 特殊符号与颜色

- **希腊字母**:
  $$ \alpha, \beta, \gamma, \Gamma, \Delta, \Omega, \psi, \Psi $$

- **颜色测试 (Fill/Stroke)**:
  $$ \color{red}{x} + \color{blue}{y} = \color{green}{z} $$
