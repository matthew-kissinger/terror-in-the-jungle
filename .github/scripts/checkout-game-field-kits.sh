#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GAME_FIELD_KITS_DEPLOY_KEY:-}" ]]; then
  echo "::error::GAME_FIELD_KITS_DEPLOY_KEY is not configured"
  exit 1
fi

mkdir -p "${HOME}/.ssh"
chmod 700 "${HOME}/.ssh"

key_path="${RUNNER_TEMP:-/tmp}/game-field-kits-deploy-key"
printf '%s\n' "${GAME_FIELD_KITS_DEPLOY_KEY}" > "${key_path}"
chmod 600 "${key_path}"

ssh-keyscan github.com >> "${HOME}/.ssh/known_hosts"

GIT_SSH_COMMAND="ssh -i ${key_path} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes" \
  git clone --depth 1 git@github.com:matthew-kissinger/game-field-kits.git ../game-field-kits
