sMV PowerChord v4.4 FULL BUILD
Run: python3 -m http.server
Open: http://localhost:8000/
Keyboard: A S D F G H J K (Maj), Q W E R T Y U I (Min), Z X C V B N M , (Drums)

GitHub connection (quickest path)
1) Set remote:
   git remote add origin https://github.com/thsulli-MeT/PowerChord.git
   # or if already exists
   git remote set-url origin https://github.com/thsulli-MeT/PowerChord.git
2) Verify:
   git remote -v
3) Push current branch:
   git push -u origin work
4) Open PR from `work` -> `main` on GitHub.

GitHub Pages deploy check
- Repo Settings -> Pages -> Source branch should be `main` (or your deploy branch)
- After merge, wait ~1-5 minutes and hard refresh.
