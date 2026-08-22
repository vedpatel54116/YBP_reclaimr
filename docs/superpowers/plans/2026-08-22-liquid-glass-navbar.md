# Liquid Glass Navbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the marketing header, dashboard sidebar, and dashboard mobile header as floating liquid-glass pills/panels per `docs/superpowers/specs/2026-08-22-liquid-glass-navbar-design.md`.

**Architecture:** A shared `.liquid-glass` CSS class in `@reclaimr/ui` applies `backdrop-filter: url(#rr-glass) saturate(1.2)` plus frost tint and inset highlights. A `LiquidGlassFilter` component renders the SVG displacement filter once in the root layout. Nav surfaces become fixed floating pills (marketing) and a floating glass panel (dashboard sidebar).

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, TypeScript strict, pnpm + turbo monorepo.

**Testing note:** `@reclaimr/ui` and `@reclaimr/web` have no test runner (only `packages/core`, `packages/queue`, `apps/api` do). Verification is `pnpm lint`, `pnpm typecheck`, and manual visual checks via `pnpm dev:web`.

---

### Task 1: `.liquid-glass` CSS class in the design system

**Files:**

- Modify: `packages/ui/src/styles.css` (append after the `@layer base` block, i.e. after line 151)

- [ ] **Step 1: Add the glass recipe**

Append to the end of `packages/ui/src/styles.css`:

```css
/*
 * Liquid glass surface. Requires the `LiquidGlassFilter` component to be
 * mounted once per page (it defines the #rr-glass SVG displacement filter).
 * Engines without `backdrop-filter: url(#…)` support (e.g. Firefox) fall back
 * to a plain blur via the @supports rule below.
 */
.liquid-glass {
  --glass-frost: 0.1;
  --glass-saturation: 1.2;
  background: color-mix(in srgb, var(--background) calc(var(--glass-frost) * 100%), transparent);
  -webkit-backdrop-filter: url(#rr-glass) saturate(var(--glass-saturation));
  backdrop-filter: url(#rr-glass) saturate(var(--glass-saturation));
  box-shadow:
    inset 0 0 2px 1px rgb(255 255 255 / 0.35),
    inset 0 0 10px 4px rgb(255 255 255 / 0.15),
    inset 0 4px 16px rgb(17 17 26 / 0.05),
    inset 0 8px 24px rgb(17 17 26 / 0.05),
    inset 0 6px 56px rgb(17 17 26 / 0.05);
}

@supports not (backdrop-filter: url(#rr-glass)) {
  .liquid-glass {
    -webkit-backdrop-filter: blur(20px) saturate(var(--glass-saturation, 1.2));
    backdrop-filter: blur(20px) saturate(var(--glass-saturation, 1.2));
  }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @reclaimr/ui lint && pnpm --filter @reclaimr/ui typecheck`
Expected: both pass with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/styles.css
git commit -m "feat(ui): add liquid-glass surface class"
```

---

### Task 2: `LiquidGlassFilter` component

**Files:**

- Create: `packages/ui/src/components/liquid-glass-filter.tsx`
- Modify: `packages/ui/src/index.ts` (add export)

- [ ] **Step 1: Create the component**

Create `packages/ui/src/components/liquid-glass-filter.tsx`:

```tsx
/**
 * Renders the SVG displacement filter referenced by the `.liquid-glass` CSS
 * class (`backdrop-filter: url(#rr-glass)`). Mount ONCE per page — the root
 * layout is the right place. The filter splits the backdrop into R/G/B
 * channels, displaces each with a different scale, and recombines them with
 * screen blending for a refractive, subtly chromatic glass effect.
 */
export function LiquidGlassFilter() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0">
      <defs>
        <filter
          id="rr-glass"
          colorInterpolationFilters="sRGB"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
        >
          <feImage
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="map"
            href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAApQAAAIdCAYAAACDcO0sAAAQAElEQVR4Aey9iZrcOo+k7bdnX3u23u7/Qj0OyUhCEEhRSmVVVhXOc2ACEQGQDLsy+ft8/c8//Pr167cC+G3xD//wD78t/t2/+3e/ffz7f//vf1v8h//wH35b/Mf/+B9/W/yn//Sfflv85//8n3/7+C//5b/8tviv//W//rb4b//tv/22+O///b//9vE//sf/+G3xP//n//zt4x//8R9//6OL//W//tdvi//9v//3bx//5//8n98+/u///b+/Y/y///f/fsf4p3/6p98x/vmf//l3Fv/yL//yuxf/+q//+nsm/u3f/u33Z8TM2aTp3c/wzBdh0UPV0WvV8fdEtf99U+5/Xy2333db/Z8L5f7PjXL7M2Wr/zOn3P482mp/Vv1qf5Zt9X/WldvPgV/t58Sv9nPkV/s5i6v/eYy5/dz2VvsZP7Pq86Fi/ZwsH8qH+jNQfwbqz0D+Z0APyj/e/Mx/f//WW/r97v7R59J+ihknjnQ9PsOvYjN9UfOK+uxM+Zv1RCzTGZZpZ7ler/otpIlhXK2f7UDtXw6UA+XA+zrwox+UH/3boi/q2T3PaGdnRp32UES8V4+04hRZb4Y/g8U94qyPrnWemT2PNDYn00XMazPO88p7oV4fPV3h5UA58PUd+PNfJn5V8DIPvv6fkOdu8JYPSn3BPXettTvOifWqar+eyXqzeviZ2abVLIXVd62aqZidJ62ipz/LZfqrWOz7jPrsnvIx64lYphOmyLSGi1OozkKcRcYXVg6UA6934DMedq+/1c/eYeb39Ds79JYPyu9suL7Iz97vSk+2h+YoMq6HHelHfMbdicVZ71DPnOFIo98LaRTKfQhTeEy5MIXyLMRZZHxh5cAXc+DtjjvzmPCat7tAHehDHPB/Biz/kI0/YJMv96DUl+IrfXn1fJ39yh7qsdCMmTC9rTM9XqM+X8d8xGfcnVic9Y710ZnkZ9SMsJ42w22OOIXqinKgHHjeAXsExPX5yd9zQvTpO9bP/s5FT56d91n9X+5B+RlGnf1CPqs/eyfNn4mzc02/zD74P1iSxvRxzbgMi32qM13Evlqd3Ut3UIizUK2wWqtqhXIfwhQes1y4wupay4Fy4JoD8Yte9bVJ79Gl8390vMfNX3uKWU9nTxHnzfZ9tq4elE/8Djzzpf1M7xNHPmydOddIk3EZpoNEPNYzmtjzjvXRmbJ7jrA4T1qFcIXyinKgHLjugH2hX5/w2k47n62z62tPVdOPHOj9Pp3pO9J+Jl8Pyhe5P/PFPqN50fF2Y3UWxY4IwEiTcRmmkRGP9Ywm61GfReQ/u9a5sjNcxTRPoX6F8opyoBy45oD/sr824Z4uf45efs9OX2tKz4vPwO92Lt5hNN9rR7rP4H78g/Kzv4g/e3/9oZs5gzQK6WMIV2R4xFRnWuE+oibWXmv5SBO5c/WvX3foj2boHlHTwwzP9OIqyoFyYN4BfUnPq+9Ras8s7pl+75TsnB+N3Xuj56ZdufuZHf38UZ/pRpqP5A4flPWFtf529Hzo4eoaceItZnWmv2vVvoqjeSNNjzuDR+1RrfMeaTzv87O9r9JnZ5rB7DxRK7yiHCgHzjugL+XzXec7tI+P8xOe7/D7n8mf3/kDJ7zpVj2/j47r+3raGU2v90788EH57Gav/uJ7xfxXzDzy8SP31F6KozOJH+l63Bk8amOtM8SImqPa9x9pP5rX2eKeIyzTSl9RDpQD5x3QF/H5rrkOzfYx13Vd5ffq5denV+erHIi/V6N9vLanM02PfyX+8gfl7OE/6ovyo/axe5/Z74zW5p9ZNV8x2zPS9rgzeNTGWueM2DP1M73xLJqlEK5QrlCuUK5QbpHVVzGb+QlrbVkOfAsH9MV790U00+Lu2TbP5sfV+M9a43mqbv8v8pz5PYm+9Xq9LtMYn3Gvwt7mQTm6YPzSPaM90zuaK643q4er52xoluJs30iveYqRxnPSKjzm8x53Bo/aWGu/iD1TP9vr+30+e86ZnqjJZgurKAfKgecc0JftcxO23Zqn2KLPV5oZ4/mpxxPinjP18dSfq+j5N+OI7+3pTbPnf/0acb9u/id9UGZfbDfv+1bjXn3fK/PVo7hqlHotzsxQz0jf48/gURtr7R+xZ+rP6u3d4+g81hd1wivKgXLgfRy4+8va5tn6ipva7NH6in1r5t6B7Pdgr2qI1ze0ZcY3pGUjrqmey9IH5XMj9/8Xsc/O+4z+s1/mR/ojvndH9V2J3rwebnv0eOHSaI1xBo/aWGt2xJ6tNdPizKwzWs0/q+/1xDnSVbynA3Wqr+eAvlifPbVmKO6ao1mKZ+dZv2b1wjQfvfbO853xKx57P0b9I90MN5p9lXs8KD/jS+wz9rxqlPU9c+Znem3/V6xH5xKvyPY+g0dtrDU/YnfWZ2ad0V4999EemltRDpQD7+WAvqyfOZH6LZ6ZY702y6/GvWL1+5zJX3GWd5858mfm7LG/12O6jO9xwjP9M9jjQfnMEPXGL0dhz0c+4dm9nu3PTzX3N7Ov2rt3phGusyiOND2+15vhGRbnRs2d9ZlZZ7S6wx36OENzK8qBcuB9HNAXsOLqidSruNpvfZrhw/A7Vj+3l9+xT8349fjfNnqffx38c6Q1PhuTcRmW9c5itz0oZzec1Z35gj3SHvE6U6bJsJ5WuKLXI85iRmPaV6zaX3E0e6TpcRk+g0XNnfWZWWe1Xq9cYb4qV1it9aiWpqIc+JIOfOND64v36vXUq3i2XzMUV+f4Ps3Jwms+Ms/O8tWxK/7FO49mmDbTHHGxZ6SP2lH91IMyfjmONjLuSo/1zq4fscfsWXo6nVHR41+Baz/F0WxpFD1dxglTxJ4ZLGrurM/MepVWnmi2QrlFrA2vtRwoB76+A898SVuv1med0IwYz87M+uMeZ+ps3lfHRvefvZuf0esZaYyLvWfx2N+rn3pQ9oa+Ar/7y3d2Xk/Xw3X3ESfexwmtbzuVaw/FTNNIJ04R52SYNBkesVfWZ2aPtOIUupPC51frOENzKsqBcuD9HNCX79lTXenRHupTKL8S6o1xZU7siTOzOvZU3Xfgin++pzfZNJG/gscZM/XpB+WVL8LZnlndzMWuaO7c/8wsaRVXztzr0TyLnsbjR1rxXm/5LC6dwvq0vrI+M3ukHXF33EEzKsqBcuA9HdAX8ZmTSa/49etM16/H/57u14V/tJ/FhfZNi82J60b0CUU8zzvXV+2JdxrN8dpMZ3zkzuA9bZzp66kHZfxS9QM+Kz97prN6f69ebw+33iPedLZK78PwmdX3KZ/pMc2RvsdnuDCFzdYa6wyLmmfqM70j7YiLd5BWIVyhXKFcoVyhvKIcKAe+nwP6Aj57K/UorvZd6bW91BvDuDvXuMeV+s7zvHrWzP1mzhDn9HpMl/E9boTHOdJGrFdPPSh7zSN89stzpBtxce+ojXXUq840GSZtL470R3xvrnD1zob0Z8Nm9/pGvLjYdxWLfTO139vrfS7NqL7KxbmjOVGruqIcKAfe34EzX6RntLq59ArlsyG9xWyP6azPr8Y9s/p5vfyZ+d+1N/Pq6K6+J9OOeONiX4bPYnGW6u6DMn5JSvyT4xk/nul9hec6j2I0e8Rn3FUs9j1Tn+kdaY84z/tcfh7V0lSUA+XA93FAX8BnbnNFf7ZH51GPheqrYTOydXLmh8iy830UdscF41lHM7020xkfuTN4ps0wv8fmQRm/DL1wJp/tn9XFPa/22ZysfxazGdmazYg6aRQR/8ha+ytGe4pXZBrhishdxWLfM/WZ3pH2KidPRr3iK8qBcuDnOnD0ZRydOatXv/VoVX021Bfj7IxZfdzn2Xp231foZs9+Zm8/c9RnukzT40Z4nCPtDCbN5kEp4GzEL9Gz/VF/Zl7UHtVxr7N1nO/7R1zUzWp939Vce1kczZCup+lxGT6DRc0z9ZnekfYZzvcqV/S8vB2vgeVAOXCrA9mXaLbB3TrtoZkK5TMhrcWM3musz1bPXc1t1tF6df5X7ut5cnQn39fTmibje1yGP4NdelBe+bIc9VxlMuOOsGyvWUyzM61wxYgT70NahcfuzDVbMTNTOkVP2+MyfAaLmmfqM70jreeUK8wPnwvztc8jp7qiHCgHvqcD+uKdudkZ3axW+0qrUD4b0vuY7Ys6PyPmUVv11oGsOuOh1x7Nirz1zuCZtofZvOkHZfzitAGj9UrPaJ64szPP6rXHUYxmilMczTBeWgvDrqw2w9aZGUfaHj/C477SeuzO+swsr1WusHP1cvGRi7U0Fp4zrNZyoBz4uQ7oC3jm9rM6zZJWoXwmpLWY0UeN9fo1au6q/R7fLT/jUbx7r9frMo3xkRvhmfYIs3nDB+WVL8jZnpFuxMWLRW2so151ppnF1K/I9MItjnjT+VU9V8PPOcptj5FOmozPcGEKr1etiNhd9ZnZXutzncXXPj/DRa3qis9yoPYtB8YOxJ/zsTpn9QWaMw2d0Uh9Rjertbln9OpRqMeHsGfDzxvlz+7zzv29e8+c2ff29KbJ+B6X4c9guwfllR+22Z5ZXTTkap/NeaZ/1DvitLd4hfJ3CJ1FMTqLeEWmyfCrWOw7U4+04hR2/l4u/i7Oz9HcinKgHCgHZhzQl/eRThrFkU68dBaqZ8L0ts70ZBrrz9ZMX9jqwFm/vH6dsP11xBu37fiV/v9YP9P2sF9//9k9KP/i3cWIu79Ez8yL2qPazuzX2CMuw0b4ESde0Zsr7iNC+ytGe4lXZBrhishdxWLfmXqk/Wwu+lN1OVAO/EwH9MV7dPO7NNpHsxTKZ0Jaixl91FivX6Pm7trv9ZXyKz74+436j3TGxxkjPNMeYTbv1IMyfmHHTbJ61HOVy/Y5wkZ7+d6eroerd8SJV0hjofrVYXtpPdprpOlxGR4x1Qq//zP1qPfVnOYr7C4+N6zWcuDNHKjjfIID+nI92vZOzcwsO4+0CqtnV/X4mO0b6fy8mXw065250d1mzh37ez2my/gel+HPYIcPyitfnFd6MhM8Fmeerf0sy+OMq7j6erPExZDWInJXa5tn68yckbbHjXC/p3S+Vh6xM/VIewenGQqdU9HLI6e6ohwoB76WA/7n++zJ9YV7tsfrj/rFK3xPls9o1CedheqZML2tMz2ZxvqzNdP/NOyKL74n88v4M1zWcwazvdIH5ZUfttmekW7E2YGfWbP5GTbaY6MPQnGKAA9L6WMMG/6QUa/6Dzz1r7QWvQbxGZfhwhReH2txETtTj7R3cFdn6F4V5UA5UA7MOqAv6ZH2iFevNArlo5BGMdJ4TloLj8/k1hfXmd67NHHvz66v3iueezTHtJnGOK2RF6bI8CuYZinSB2Uc2KvjF/EV3WhG5J6tdb444wwmrSKbIdxCvMLqs6t6R3F2nvQ2T3kvepoRHmdJ6zHVioj1amkVxvtcmK99PuKkU0ij6OUjTj0KaSrKgXLg6znwESfWl+rVfWZ6ZzUzOp1TOgvVs2E9ts72jQV1sMzb/X4kEbhsaty+Sp6ftIoMl2FR+2ozvpaes/53Hqz0+uqPOvrYZVXhff8erz37WkXvzawNrA/kGYO6xB3P6fOp9KHz2/e775J/v/HxQfv5V1w0/fQMzD4AZbfa5R/pHNN67p0///S5eS97X/8P9F8K0Nf7f9X7OnpE+W1es6n7XvBnv9uIUbv5unvV6tHof66Y9Gz+i+Z8X7e9Snt7X4vWglFAclAPlQDlQDpQDJxzIPuhGv4Z+/Z7F9Nn8EXuM6OnV4qM+GfX6vP9S9PnV/bN3+L3+p6fG3xH27shZf9U3q6vOeh9yX9gZ9g/36kEpMlLK9+l8PVDgOVAOfFYHcujD+RpeX0f39XfMvGeWf4vXj8T8rM8M8zPhXn/UqE+8RuzV0rQ4K9+KnfGmv8s3sD6erx6UPWcKLwfKgXKgHCgHfsEBe7D1/kZ8b89or9F+Prc+/0zv3R9/t79/y0u8YuxL1GfWb+mP6v38WnzE+bHOfbXfV96yD9j+reT1oPyWb0BtWQ6UA+VAOVAPnOfAnzxcPHN7vPfO9PZ6u/uT9p7uK0f/r97nOf38p/uY4fHReS2vXhNreYn/JeXz9+Y8KOfcrFmHDoD2GPCgdW1gbeDnbuArH6y9Dzo3GjOayEevWToL1Ufz9zKszuh9RuxrRms+Z+b3+BlMf6SReZ+NuVdLezXywt7XU+WteT0orzhYPeVAOVAOlAPlwK84YI+Xz8+X6OnzE76F/R2YmUf7qFec7U3zI/r0MGPWv7Onm9FmHsh7g+0fI9vVvE4PrI7v0X3y3Z56UFaX039KB4DNZ8Eez6bA7p7A42cAew2Mf9K0WfA+mNNZ6P7Ies3Y38O2D8YwjX9Fhvf0MGL66FmY93oRP/N7es5jI06YIuPX+vT3qAclUPlf08C3bODZhzvE16v9r/yB/WfG6rE76vE9D6v/AunO8D59Gf3p/jP9M/NRPfLpYQonPeIpnWJEex7GvT9zXvFh5yN8b8z79Xf+7O9gLff3U/WgvOJi9ZQD5UA5UA6UA5/kgD1eOj0i/iAn/C0unR6vMzzb90Q+es+Xj849Yp8T/4u9H0S7bZ6F+2dY9K6ofjOfpXUWe49e3vIqXJzpz2rU2uYpfXUez9XbeYdYv63MfyoLXRv4eRswenSdwcIUR73W9+rpRzyPzWjpWlzG3f3Z+97pGekjToxqTsujWv6pD8ofv38VvzbwpQ0AD//S89n/Kef+q3bA9p9vV04n3nLY6mGPe2M8Y7I0Pka9bY491ss94R6vUfN4f0XEz+jP3Bv2pT69Z5v5Ue/+rR6U3uGqf8YGoP9ogcYDKrcBLL9pAMtz8InRymcY9X91K670+OjxGvXe6SreKzO9vGf56H3O0GfeAcaPsK3VM9rsc8X6YfWgvOpi6csB4PFoAmP8KIFV+8D0Y0Z8R7W+P7Mv4Z6re3tGzXnN9On94/F+uD83M3+H5mZzzT3D488C9v4r3+2pB+XgVnXlQDlQDpQD5cC/cgPY9wZg/bbyb93An7Yg+H9vA1c8f+R8G/PThB/+H/fVf0m8v+C/xH6rV6/VnZ/+L9R5rZ26t7eU+Zf0mWe1ZqbeW0X+XgP9rN9O97X8vD3++7hUD0r9E+XlQDlQDpQD5cC9DhRP7T/p9Gf7L7EvV8vbeE+/j6iN++Xv6m9xrZfH3pXby+LkfdbL9Fev7mU+37PzF1gUf9bLfbZ76/P/mHclV6vP1s98Zq/nfbZnvZ0N+F072D0or9pefeVAOVAOfFcHeoxE9H9O9P/R1f+TPhv1R67K8YyO9mP9bO9oZp7ofZ+969X8M72z82fna8/V971T/V4vT4X/pZz/qI66K4t6/v4D+v3XyEdfV/ovOf/+H/8bC/+r6nOfE79H/T+K99rC+hWw2B/5T2FffgKofYDN94bN8F4/Z8byR/K1ZzUrf/O/+rXf67/+D/wQ6pA3/uL8jC3O7/tX/f7f/gX9vI/pZ/sD087sT8U+s/oYf/+ZtWfrb8D/3D09u7N+6pWfP6XzX/F6zL6m/6D0p8vKgXKgHCgHyoFy4L9gAxH6XfO5b4b9bK/fPZ//r/Y39f/bAetgO99f5X9D+XUerz7D3f7L/D0925m/+L/gP60OfvH9V/v9F73O/L+iM/+7+q+xL74v/k/R/L0BWB/vWf/K++L/g/+E+n/+93/4H/D/b/+E+X+g+R9Y/h8AAAAASUVORK5CYII="
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            result="dispRed"
            scale="-20"
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feColorMatrix
            in="dispRed"
            type="matrix"
            values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
            result="red"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            result="dispGreen"
            scale="-24"
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feColorMatrix
            in="dispGreen"
            type="matrix"
            values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0"
            result="green"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            result="dispBlue"
            scale="-28"
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feColorMatrix
            in="dispBlue"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"
            result="blue"
          />
          <feBlend in="red" in2="green" mode="screen" result="rg" />
          <feBlend in="rg" in2="blue" mode="screen" result="output" />
          <feGaussianBlur in="output" stdDeviation="3" />
        </filter>
      </defs>
    </svg>
  );
}
```

- [ ] **Step 2: Export it**

In `packages/ui/src/index.ts`, add this line after the `export { EmptyState, ... }` line (line 23):

```ts
export { LiquidGlassFilter } from "./components/liquid-glass-filter";
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @reclaimr/ui lint && pnpm --filter @reclaimr/ui typecheck`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/liquid-glass-filter.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add LiquidGlassFilter SVG definition component"
```

---

### Task 3: Mount the filter in the root layout

**Files:**

- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Add the import**

Change line 5 of `apps/web/src/app/layout.tsx` from:

```tsx
import { ThemeProvider, ToastProvider, themeInitScript } from "@reclaimr/ui";
```

to:

```tsx
import { LiquidGlassFilter, ThemeProvider, ToastProvider, themeInitScript } from "@reclaimr/ui";
```

- [ ] **Step 2: Render it once inside `<body>`**

Change the body block (lines 38–42) from:

```tsx
<body className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
  <ThemeProvider>
    <ToastProvider>{children}</ToastProvider>
  </ThemeProvider>
</body>
```

to:

```tsx
<body className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
  {/* SVG displacement filter used by every .liquid-glass surface. */}
  <LiquidGlassFilter />
  <ThemeProvider>
    <ToastProvider>{children}</ToastProvider>
  </ThemeProvider>
</body>
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @reclaimr/web lint && pnpm --filter @reclaimr/web typecheck`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): mount LiquidGlassFilter in root layout"
```

---

### Task 4: Marketing header — split floating pills

**Files:**

- Modify: `apps/web/src/components/site-header.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the header**

Replace the entire contents of `apps/web/src/components/site-header.tsx` with:

```tsx
import Link from "next/link";
import { APP_NAME } from "@reclaimr/shared";
import { buttonClasses, ThemeToggle } from "@reclaimr/ui";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/design", label: "Design system" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

/**
 * Floating liquid-glass header: three fixed pills (wordmark, nav links,
 * actions) inset from the top edge. The wrapper ignores pointer events so
 * the page behind the gaps stays clickable; each pill re-enables them.
 */
export function SiteHeader() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 p-3">
      <Link
        href="/"
        className="liquid-glass pointer-events-auto flex h-12 items-center rounded-full px-5 font-heading text-lg font-bold tracking-tight uppercase focus-visible:outline-2"
      >
        {APP_NAME}
      </Link>

      <nav
        aria-label="Main navigation"
        className="liquid-glass pointer-events-auto hidden h-12 items-center gap-6 rounded-full px-6 md:flex"
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="liquid-glass pointer-events-auto flex h-12 items-center gap-2 rounded-full px-3">
        <ThemeToggle />
        <Link href="/login" className={`${buttonClasses("ghost", "sm")} hidden sm:inline-flex`}>
          Log in
        </Link>
        <Link href="/signup" className={`${buttonClasses("primary", "sm")} hidden sm:inline-flex`}>
          Get started
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @reclaimr/web lint && pnpm --filter @reclaimr/web typecheck`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/site-header.tsx
git commit -m "feat(web): restyle marketing header as floating glass pills"
```

---

### Task 5: Top padding on pages using the fixed header

The header no longer occupies document flow, so pages that render `<SiteHeader />` need top clearance.

**Files:**

- Modify: `apps/web/src/app/page.tsx:69`
- Modify: `apps/web/src/app/design/page.tsx:85`

- [ ] **Step 1: Landing page**

In `apps/web/src/app/page.tsx`, change line 69 from:

```tsx
      <main className="flex-1">
```

to:

```tsx
      <main className="flex-1 pt-20">
```

- [ ] **Step 2: Design system page**

In `apps/web/src/app/design/page.tsx`, change line 85 from:

```tsx
      <main className="flex-1">
```

to:

```tsx
      <main className="flex-1 pt-20">
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @reclaimr/web lint && pnpm --filter @reclaimr/web typecheck`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/design/page.tsx
git commit -m "feat(web): add top clearance for fixed glass header"
```

---

### Task 6: Dashboard desktop sidebar — floating glass panel

**Files:**

- Modify: `apps/web/src/app/dashboard/layout.tsx`

- [ ] **Step 1: Update the body offset**

In `apps/web/src/app/dashboard/layout.tsx`, change line 14 from:

```tsx
    <div className="min-h-dvh lg:pl-60">
```

to:

```tsx
    <div className="min-h-dvh lg:pl-[17.5rem]">
```

(240px panel + 12px left inset + 16px gap.)

- [ ] **Step 2: Restyle the aside**

Change line 16 from:

```tsx
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-background lg:flex">
```

to:

```tsx
      <aside className="liquid-glass fixed inset-y-3 left-3 z-40 hidden w-60 flex-col rounded-3xl lg:flex">
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @reclaimr/web lint && pnpm --filter @reclaimr/web typecheck`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(web): restyle dashboard sidebar as floating glass panel"
```

---

### Task 7: Dashboard mobile header — floating glass pills

**Files:**

- Modify: `apps/web/src/app/dashboard/layout.tsx` (the `lg:hidden` header block, lines 52–66)

- [ ] **Step 1: Replace the sticky header with fixed pills**

Replace this block:

```tsx
{
  /* Mobile header + nav */
}
<header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur lg:hidden">
  <div className="flex h-14 items-center justify-between px-4">
    <Link
      href="/"
      className="font-heading text-base font-bold tracking-tight uppercase focus-visible:outline-2"
    >
      {APP_NAME}
    </Link>
    <ThemeToggle />
  </div>
  <div className="border-t pb-2 pt-2">
    <SidebarNav variant="horizontal" unreadAlerts={unreadAlerts} />
  </div>
</header>;
```

with:

```tsx
{
  /* Mobile header + nav: floating glass pills */
}
<div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-col gap-2 p-3 lg:hidden">
  <div className="liquid-glass pointer-events-auto flex h-14 items-center justify-between rounded-full px-5">
    <Link
      href="/"
      className="font-heading text-base font-bold tracking-tight uppercase focus-visible:outline-2"
    >
      {APP_NAME}
    </Link>
    <ThemeToggle />
  </div>
  <div className="liquid-glass pointer-events-auto rounded-full py-2">
    <SidebarNav variant="horizontal" unreadAlerts={unreadAlerts} />
  </div>
</div>;

{
  /* Clearance for the fixed mobile pills */
}
<div className="h-32 lg:hidden" aria-hidden="true" />;
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @reclaimr/web lint && pnpm --filter @reclaimr/web typecheck`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(web): restyle dashboard mobile header as glass pills"
```

---

### Task 8: Full verification

- [ ] **Step 1: Repo-wide lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: all packages pass.

- [ ] **Step 2: Format check**

Run: `pnpm format:check`
Expected: no formatting issues. If any are reported, run `pnpm format` and commit the result with `git commit -am "style: format"`.

- [ ] **Step 3: Manual visual check**

Run: `pnpm dev:web` and open http://localhost:3000. Verify:

1. `/` light theme: three floating glass pills at top; hero content not hidden; scroll — pills stay fixed; `#how-it-works` / `#features` anchors land below the pills.
2. `/` dark theme (toggle): pills still legible, highlights visible.
3. `/design`: same header behavior, content clears the pills.
4. `/dashboard` desktop (≥ lg): floating glass sidebar panel with 12px insets, rounded corners, content offset correct.
5. `/dashboard` mobile width (< lg): wordmark pill + scrollable nav pill; content clears them; nav scrolls horizontally.
6. Keyboard: Tab through every pill — focus rings visible; Enter activates links.
7. Firefox (or DevTools emulation of no `backdrop-filter: url()` support): pills fall back to plain blur, still usable.

- [ ] **Step 4: Final commit (only if formatting changed anything)**

```bash
git status
git diff --stat
```

If clean, nothing to commit.
