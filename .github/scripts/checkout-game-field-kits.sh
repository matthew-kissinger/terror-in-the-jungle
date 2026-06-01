#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GAME_FIELD_KITS_DEPLOY_KEY:-}" ]]; then
  echo "::error::GAME_FIELD_KITS_DEPLOY_KEY is not configured"
  exit 1
fi

ssh_dir="${RUNNER_TEMP:-/tmp}"
key_path="${ssh_dir}/game-field-kits-deploy-key"
known_hosts="${ssh_dir}/game-field-kits-known_hosts"

printf '%s\n' "${GAME_FIELD_KITS_DEPLOY_KEY}" > "${key_path}"
chmod 600 "${key_path}"

# Pin GitHub's host keys to an explicit file rather than ${HOME}/.ssh: $HOME
# differs between host runners (/home/runner) and container jobs (/github/home),
# so relying on ~/.ssh/known_hosts breaks the clone inside the Playwright
# container with "No ED25519 host key is known ... strict checking". Scanning
# rsa,ecdsa,ed25519 explicitly and pointing ssh at the file via
# UserKnownHostsFile works identically in both environments.
ssh-keyscan -t rsa,ecdsa,ed25519 github.com > "${known_hosts}" 2>/dev/null

GIT_SSH_COMMAND="ssh -i ${key_path} -o IdentitiesOnly=yes -o UserKnownHostsFile=${known_hosts} -o StrictHostKeyChecking=yes" \
  git clone --depth 1 git@github.com:matthew-kissinger/game-field-kits.git ../game-field-kits
