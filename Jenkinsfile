
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        AWS_REGION       = 'ap-south-1'
        REGISTRY         = '789005345642.dkr.ecr.ap-south-1.amazonaws.com'
        IMAGE_NAME       = 'spendwise-frontend'

        CONTAINER_NAME    = 'spendwise-frontend'
        CANDIDATE_NAME    = 'spendwise-frontend-candidate'
        NETWORK           = 'spendwise-network'
        BACKEND_CONTAINER = 'spendwise-backend'
        DEPLOY_DIR        = '/opt/spendwise-frontend'
        CANDIDATE_PORT    = '18080'
    }

    stages {

        stage('Checkout') {
            steps {
                echo 'Checking out SpendWise frontend'
                checkout scm
            }
        }

        stage('Environment Check') {
            steps {
                sh '''
                    set -e
                    docker --version
                    docker compose version
                    aws --version
                '''
            }
        }

        stage('Build Angular Docker Image') {
            steps {
                script {
                    env.IMAGE_TAG = "build-${env.BUILD_NUMBER}"
                }

                sh '''
                    set -e

                    echo "Building Angular frontend inside Docker..."

                    docker build \
                        --pull \
                        -t "$REGISTRY/$IMAGE_NAME:$IMAGE_TAG" .
                '''
            }
        }

        stage('Push Image to ECR') {
            steps {
                sh '''
                    set +x
                    set -e

                    trap 'docker logout "$REGISTRY" >/dev/null 2>&1 || true' EXIT

                    echo "Authenticating with Amazon ECR..."

                    aws ecr get-login-password --region "$AWS_REGION" \
                        | docker login \
                            --username AWS \
                            --password-stdin "$REGISTRY"

                    echo "Pushing frontend image to ECR..."

                    docker push "$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
                '''
            }
        }

        stage('Deploy and Verify') {
            steps {
                sh '''
                    set +x
                    set -eu

                    IMAGE="$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
                    STATE_FILE="$DEPLOY_DIR/last-successful-image"

                    OLD_IMAGE=""

                    if [ -f "$STATE_FILE" ]; then
                        OLD_IMAGE=$(cat "$STATE_FILE")
                    fi

                    trap 'docker logout "$REGISTRY" >/dev/null 2>&1 || true' EXIT

                    echo "Previous successful image: ${OLD_IMAGE:-none}"
                    echo "New frontend image: $IMAGE"

                    # Verify shared Docker network.
                    docker network inspect "$NETWORK" >/dev/null 2>&1 || {
                        echo "ERROR: Docker network $NETWORK does not exist."
                        exit 1
                    }

                    # Ensure backend container exists.
                    docker inspect "$BACKEND_CONTAINER" >/dev/null 2>&1 || {
                        echo "ERROR: Backend container does not exist."
                        exit 1
                    }

                    # Ensure backend is attached to the shared network.
                    if ! docker inspect -f '{{json .NetworkSettings.Networks}}' \
                        "$BACKEND_CONTAINER" | grep -q "$NETWORK"; then

                        docker network connect "$NETWORK" "$BACKEND_CONTAINER"
                    fi

                    # Authenticate and pull new image from ECR.
                    aws ecr get-login-password --region "$AWS_REGION" \
                        | docker login \
                            --username AWS \
                            --password-stdin "$REGISTRY"

                    docker pull "$IMAGE"

                    # Remove any stale candidate.
                    docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true

                    # Start candidate on a temporary loopback port.
                    docker run -d \
                        --name "$CANDIDATE_NAME" \
                        --network "$NETWORK" \
                        --publish "127.0.0.1:$CANDIDATE_PORT:80" \
                        "$IMAGE"

                    wait_for_health() {
                        CHECK_URL="$1"
                        ATTEMPT=1

                        while [ "$ATTEMPT" -le 30 ]; do

                            FRONTEND_STATUS=$(curl -s -o /dev/null \
                                -w '%{http_code}' \
                                "$CHECK_URL/" || true)

                            API_RESPONSE=$(curl -fsS \
                                "$CHECK_URL/api/health" \
                                2>/dev/null || true)

                            if [ "$FRONTEND_STATUS" = "200" ] && \
                               echo "$API_RESPONSE" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then

                                echo "Frontend and backend checks passed."
                                echo "$API_RESPONSE"
                                return 0
                            fi

                            echo "Health check attempt $ATTEMPT/30..."
                            sleep 5
                            ATTEMPT=$((ATTEMPT + 1))
                        done

                        return 1
                    }

                    # Verify candidate before replacing production.
                    if ! wait_for_health "http://127.0.0.1:$CANDIDATE_PORT"; then
                        echo "Candidate deployment failed."
                        docker logs "$CANDIDATE_NAME" || true
                        docker rm -f "$CANDIDATE_NAME" || true
                        exit 1
                    fi

                    # Candidate is healthy. Replace production frontend.
                    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

                    DEPLOY_SUCCESS=0

                    if docker run -d \
                        --name "$CONTAINER_NAME" \
                        --restart unless-stopped \
                        --network "$NETWORK" \
                        --publish 80:80 \
                        "$IMAGE"; then

                        if wait_for_health "http://127.0.0.1"; then
                            DEPLOY_SUCCESS=1
                        fi
                    fi

                    # Remove temporary candidate.
                    docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true

                    if [ "$DEPLOY_SUCCESS" -eq 1 ]; then

                        printf '%s\\n' "$IMAGE" > "$STATE_FILE.tmp"
                        mv "$STATE_FILE.tmp" "$STATE_FILE"

                        echo "Frontend deployment successful: $IMAGE"

                    else

                        echo "Frontend production deployment failed."
                        docker logs "$CONTAINER_NAME" || true
                        docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

                        if [ -n "$OLD_IMAGE" ]; then

                            echo "Rolling back to $OLD_IMAGE"

                            if docker run -d \
                                --name "$CONTAINER_NAME" \
                                --restart unless-stopped \
                                --network "$NETWORK" \
                                --publish 80:80 \
                                "$OLD_IMAGE"; then

                                if wait_for_health "http://127.0.0.1"; then
                                    echo "Frontend rollback successful."
                                else
                                    echo "CRITICAL: Frontend rollback health check failed."
                                    docker logs "$CONTAINER_NAME" || true
                                    exit 1
                                fi
                            else
                                echo "CRITICAL: Could not start previous frontend image."
                                exit 1
                            fi

                        else
                            echo "No previous successful frontend deployment exists."
                        fi

                        exit 1
                    fi
                '''
            }
        }
    }

    post {
        success {
            echo 'SpendWise frontend CI/CD completed successfully!'
        }

        failure {
            echo 'SpendWise frontend pipeline failed. Check console output.'
        }

        always {
            echo 'Frontend pipeline execution finished.'
        }
    }
}
