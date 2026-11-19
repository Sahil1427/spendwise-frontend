
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
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
                    node --version
                    npm --version
                '''
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Build Angular') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Archive Artifact') {
            steps {
                archiveArtifacts(
                    artifacts: 'dist/**/*',
                    fingerprint: true
                )
            }
        }
    }

    post {
        success {
            echo 'SpendWise frontend CI completed successfully!'
        }
        failure {
            echo 'SpendWise frontend CI failed. Check the console output.'
        }
        always {
            echo 'Frontend pipeline execution finished.'
        }
    }
}
