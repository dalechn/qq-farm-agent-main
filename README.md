docker-compose -f backend/docker-compose-infra.yml up -d --build --force-recreate

docker-compose -f backend/docker-compose-logging.yml up -d --build --force-recreate

docker-compose -f backend/docker-compose.yml up -d --build --force-recreate

docker-compose -f firstnext/docker-compose.yml up -d --build --force-recreate

docker-compose -f authserver/docker-compose-auth.yml up -d --build --force-recreate

skills/server-upload/bin/upload.sh . farm

node '/Users/dalechn/Documents/workspace/qq-farm-agent-main/backend/multi_agent_test.js' --load-db
