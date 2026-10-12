# Hero visual baselines

Frozen frames (`?freeze=1`) of the production build, written by `npm run hero:baseline -- --update` and
checked by `npm run hero:baseline` (a shot fails above 0.2% of differing pixels). See HERO_SPEC.md.

GPU output differs between machines and drivers: these were rendered by headless Chrome 155 on an Intel Iris Xe
(ANGLE, Direct3D 11) on Windows. On another machine, write a local set first (`-- --update`) and compare
against that, or regenerate these here after a deliberate design change.
