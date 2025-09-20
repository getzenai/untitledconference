# Codex Environment Setup

The setup script must be added to the environment Setup script. Toggle it from automatic to manual and paste the content of `setup_script.sh`.

The script creates a postgres database with a `local` and `test` database. It then copies the `.env.example` file to `.env` and replaces the database configuration with the correct one
