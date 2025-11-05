#!/bin/bash

# Qwen3 ASR Docker部署脚本
# 使用方法: ./deploy.sh [start|stop|restart|logs|status]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 应用信息
APP_NAME="qwen3-asr"
CONTAINER_NAME="${APP_NAME}-container"
IMAGE_NAME="${APP_NAME}:latest"
PORT="8888"

# 函数定义
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查Docker是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi
}

# 创建必要的目录
create_directories() {
    log_info "创建必要的目录..."
    mkdir -p uploads logs
    log_success "目录创建完成"
}

# 构建镜像
build_image() {
    log_info "构建Docker镜像..."
    docker build -t ${IMAGE_NAME} .
    log_success "镜像构建完成"
}

# 启动服务
start_service() {
    log_info "启动Qwen3 ASR服务..."
    
    # 检查端口是否被占用
    if lsof -Pi :${PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_warning "端口${PORT}已被占用，正在停止占用该端口的容器..."
        docker-compose down
    fi
    
    # 启动服务
    docker-compose up -d
    
    # 等待服务启动
    log_info "等待服务启动..."
    sleep 5
    
    # 检查服务状态
    if check_service_health; then
        log_success "Qwen3 ASR服务启动成功！"
        log_info "访问地址: http://localhost:${PORT}"
        log_info "健康检查: http://localhost:${PORT}/healthz"
        log_info "API端点: http://localhost:${PORT}/v1/audio/transcriptions"
    else
        log_error "服务启动失败，请检查日志"
        show_logs
        exit 1
    fi
}

# 停止服务
stop_service() {
    log_info "停止Qwen3 ASR服务..."
    docker-compose down
    log_success "服务已停止"
}

# 重启服务
restart_service() {
    log_info "重启Qwen3 ASR服务..."
    stop_service
    sleep 2
    start_service
}

# 显示日志
show_logs() {
    log_info "显示服务日志..."
    docker-compose logs -f
}

# 检查服务状态
check_status() {
    log_info "检查服务状态..."
    docker-compose ps
    
    if check_service_health; then
        log_success "服务运行正常"
        log_info "访问地址: http://localhost:${PORT}"
    else
        log_warning "服务可能未正常运行"
    fi
}

# 检查服务健康状态
check_service_health() {
    if curl -s http://localhost:${PORT}/healthz > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 清理资源
cleanup() {
    log_info "清理Docker资源..."
    docker-compose down --rmi all --volumes --remove-orphans
    docker system prune -f
    log_success "清理完成"
}

# 显示帮助信息
show_help() {
    echo "Qwen3 ASR Docker部署脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [命令]"
    echo ""
    echo "命令:"
    echo "  start     启动服务"
    echo "  stop      停止服务"
    echo "  restart   重启服务"
    echo "  logs      显示日志"
    echo "  status    检查状态"
    echo "  cleanup   清理资源"
    echo "  help      显示帮助"
    echo ""
    echo "示例:"
    echo "  $0 start"
    echo "  $0 logs"
    echo "  $0 status"
}

# 主函数
main() {
    case "${1:-start}" in
        start)
            check_docker
            create_directories
            build_image
            start_service
            ;;
        stop)
            check_docker
            stop_service
            ;;
        restart)
            check_docker
            restart_service
            ;;
        logs)
            check_docker
            show_logs
            ;;
        status)
            check_docker
            check_status
            ;;
        cleanup)
            check_docker
            cleanup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"