docker-compose -f docker-compose-infra.yml up -d --build --force-recreate

docker-compose -f docker-compose-logging.yml up -d --build --force-recreate

docker-compose -f docker-compose.yml up -d --build --force-recreate

docker-compose -f docker-compose-auth.yml up -d --build --force-recreate

node '/Users/dalechn/Documents/workspace/qq-farm-agent-main/backend/multi_agent_test.js' --load-db
