# Установщик Space Universe

В этой папке находятся заготовки для установки игры **Space Universe** (Godot 4.7.2).

> Важно: сам исполняемый файл игры создаётся экспортом проекта из Godot. Установщик упаковывает уже экспортированные файлы.

## 1. Экспорт игры из Godot

1. Установите **Godot 4.7.2** (standard): https://godotengine.org/download/archive/4.7.2-stable/
2. Откройте проект из папки `../SpaceUniverse` в Godot.
3. Установите шаблоны экспорта (Editor → Manage Export Templates → Download and Install).
4. Настройте пресет экспорта: **Project → Export… → Add… → Windows Desktop**.
   - (Рекомендуется) имя исполняемого файла: `SpaceUniverse.exe`
   - Включите необходимые ресурсы проекта.
5. Экспортируйте в папку: `../export/windows/`
   - В папке должны появиться `SpaceUniverse.exe`, `SpaceUniverse.pck` и сопутствующие файлы (если есть).

## 2. Вариант A — полноценный установщик (Inno Setup)

1. Установите [Inno Setup 6](https://jrsoftware.org/isinfo.php).
2. Откройте `SpaceUniverse.iss` в Inno Setup Compiler (или запустите `build_installer.cmd`, если `ISCC.exe` установлен в стандартный путь).
3. После сборки установщик будет создан в `../dist/SpaceUniverse_Setup_0.1.0.exe`.

Скрипт установщика: `SpaceUniverse.iss` (берёт файлы из `../export/windows/`, создаёт ярлыки в меню Пуск и опционально на рабочем столе).

## 3. Вариант B — установка без Inno Setup (PowerShell)

Если экспорт уже лежит в `../export/windows/`, можно установить игру скриптом:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-SpaceUniverse.ps1
```

По умолчанию установка выполняется в `%LOCALAPPDATA%\Space Universe` и создаются ярлыки в меню Пуск/на рабочем столе. Параметры:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-SpaceUniverse.ps1 -InstallDir "C:\Games\Space Universe" -NoDesktopShortcut
```

Удаление: запустите ярлык "Uninstall Space Universe" из меню Пуск или удалите папку установки и ярлыки.

## 4. Портативный вариант

Можно просто скопировать содержимое `../export/windows/` в любую папку и запускать `SpaceUniverse.exe` без установки.
