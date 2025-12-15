# Run Script on Property Edit

An Obsidian plugin that detects when YAML frontmatter properties are edited and automatically runs specified scripts.

## Usage

1. ~Go to Settings → Community Plugins → Run Script on Property Edit~ Have to download manually currently. 
   Clone this repo to `[your vault]/.obsidian/plugins/` and add the folder name to `.obsidian/community-plugins.json`
3. Click "Add new property rule"
4. Configure your rule:
   - **Property name**: The frontmatter property to watch (e.g., `status`, `closed`, `tags`)
   - **Script path**: Full path to your script (e.g., `C:\Scripts\my-script.bat` or `/usr/local/bin/my-script.sh`) (haven't tested with a .sh)
   - **Show notification**: Toggle to show a notification when the script runs
5. Enable the rule
6. Edit the property in any note's frontmatter to trigger the script

## Environment Variables

Your script receives these environment variables:

- `PROPERTY_NAME` - Name of the edited property
- `PROPERTY_VALUE` - New value of the property
- `PREVIOUS_VALUE` - Previous value of the property (this will be blank unless changed previously in the same obsidian instance)
- `FILE_PATH` - Path to the file (relative to vault)
- `FILE_NAME` - Name of the file
- `VAULT_PATH` - Full path to the vault

## Example

Watch for a `closed` property and move the file when set to `true`:

```bat
@echo off
if /I "%PROPERTY_VALUE%"=="true" (
    move "%VAULT_PATH%\%FILE_PATH%" "C:\Archive\%FILE_NAME%"
)
```

## Disclosure

This was basically fully made with AI, I think I wrote like two lines of it.
If anything doesn't work let me know by creating an issue.
