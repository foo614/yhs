import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Form, Input, Pagination, Select, Space, Switch, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { OperationsProTable } from "../shared/OperationsProTable";
import {
  createVehicleCatalogModel,
  getVehicleCatalogModels,
  humanizeApiError,
  updateVehicleCatalogModel,
  type VehicleCatalogModel,
  type VehicleCatalogModelInput
} from "../../api";

const mobileCatalogPageSize = 8;
const malaysiaCatalogSourceUrl = "https://data.gov.my/data-catalogue/registration_transactions_car";

export type VehicleCatalogFilters = {
  keyword?: string;
  status?: "active" | "hidden";
};

export function filterVehicleCatalogModels(models: VehicleCatalogModel[], filters: VehicleCatalogFilters) {
  const keyword = filters.keyword?.trim().toLowerCase();

  return models.filter((model) => {
    if (keyword && !`${model.make} ${model.model}`.toLowerCase().includes(keyword)) return false;
    if (filters.status === "active" && !model.isActive) return false;
    if (filters.status === "hidden" && model.isActive) return false;

    return true;
  });
}

export function VehicleCatalogSettings() {
  const [catalogModels, setCatalogModels] = useState<VehicleCatalogModel[]>([]);
  const [catalogFilters, setCatalogFilters] = useState<VehicleCatalogFilters>({});
  const [mobileCatalogPage, setMobileCatalogPage] = useState(1);
  const [catalogEditingId, setCatalogEditingId] = useState<string | null>(null);
  const [catalogForm] = Form.useForm<VehicleCatalogModelInput>();
  const filteredCatalogModels = useMemo(
    () => filterVehicleCatalogModels(catalogModels, catalogFilters),
    [catalogFilters, catalogModels]
  );
  const mobileCatalogPageCount = Math.max(1, Math.ceil(filteredCatalogModels.length / mobileCatalogPageSize));
  const clampedMobileCatalogPage = Math.min(mobileCatalogPage, mobileCatalogPageCount);
  const mobileCatalogModels = filteredCatalogModels.slice(
    (clampedMobileCatalogPage - 1) * mobileCatalogPageSize,
    clampedMobileCatalogPage * mobileCatalogPageSize
  );
  const catalogFilterActive = Object.values(catalogFilters).some((value) => value !== undefined && value !== "");
  const activeModelCount = catalogModels.filter((item) => item.isActive).length;
  const makeCount = new Set(catalogModels.map((item) => item.make.toLocaleLowerCase())).size;

  const loadCatalogModels = useCallback(async () => {
    try {
      setCatalogModels(await getVehicleCatalogModels());
    } catch (error) {
      message.error(humanizeApiError(error, "Unable to load the vehicle catalogue."));
    }
  }, []);

  useEffect(() => {
    void loadCatalogModels();
  }, [loadCatalogModels]);

  useEffect(() => {
    if (mobileCatalogPage !== clampedMobileCatalogPage) {
      setMobileCatalogPage(clampedMobileCatalogPage);
    }
  }, [clampedMobileCatalogPage, mobileCatalogPage]);

  async function saveCatalogModel(values: VehicleCatalogModelInput) {
    try {
      if (catalogEditingId) {
        await updateVehicleCatalogModel(catalogEditingId, values);
        message.success("Vehicle catalogue option updated.");
      } else {
        await createVehicleCatalogModel(values);
        message.success("Vehicle catalogue option added.");
      }
      setCatalogEditingId(null);
      catalogForm.resetFields();
      catalogForm.setFieldValue("isActive", true);
      await loadCatalogModels();
    } catch (error) {
      message.error(humanizeApiError(error, "Unable to save the vehicle catalogue option."));
    }
  }

  async function toggleCatalogModel(item: VehicleCatalogModel) {
    try {
      await updateVehicleCatalogModel(item.id, { make: item.make, model: item.model, isActive: !item.isActive });
      message.success(`Vehicle catalogue option ${item.isActive ? "hidden" : "shown"} on the website.`);
      await loadCatalogModels();
    } catch (error) {
      message.error(humanizeApiError(error, "Unable to update the vehicle catalogue option."));
    }
  }

  function editCatalogModel(item: VehicleCatalogModel) {
    setCatalogEditingId(item.id);
    catalogForm.setFieldsValue({ make: item.make, model: item.model, isActive: item.isActive });
  }

  function updateCatalogFilter<K extends keyof VehicleCatalogFilters>(key: K, value: VehicleCatalogFilters[K] | undefined) {
    setMobileCatalogPage(1);
    setCatalogFilters((current) => ({ ...current, [key]: value || undefined }));
  }

  const renderCatalogActions = (item: VehicleCatalogModel) => (
    <Space className="tableActionGroup" wrap size={6}>
      <Button size="small" type="primary" onClick={() => editCatalogModel(item)}>Edit</Button>
      <Button size="small" onClick={() => void toggleCatalogModel(item)}>{item.isActive ? "Hide" : "Show"}</Button>
    </Space>
  );
  const catalogColumns: ColumnsType<VehicleCatalogModel> = [
    { title: "Make / 品牌", dataIndex: "make" },
    { title: "Model / 车型", dataIndex: "model" },
    { title: "Website filter", dataIndex: "isActive", render: (isActive) => <Tag color={isActive ? "green" : "default"}>{isActive ? "Visible" : "Hidden"}</Tag> },
    { title: "Action / 操作", fixed: "right", width: 190, render: (_, item) => renderCatalogActions(item) }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <div className="settingsOverview">
        <div>
          <span className="moduleEyebrow">Website filters</span>
          <Typography.Title level={3}>Website Make & Model Catalogue / 网站品牌车型目录</Typography.Title>
          <Typography.Text>
            Manage the make and model options shown in public inventory filters without changing existing vehicle records.
          </Typography.Text>
        </div>
        <div className="rbacSummary">
          <span><strong>{makeCount}</strong>makes</span>
          <span><strong>{catalogModels.length}</strong>models</span>
          <span><strong>{activeModelCount}</strong>visible</span>
        </div>
      </div>
      <Alert
        className="operationalInfoAlert"
        type="info"
        showIcon
        message={(
          <span>
            Catalogue defaults use models with at least 100 Malaysian JPJ registrations from January 2025 through July 2026. {" "}
            <Typography.Link href={malaysiaCatalogSourceUrl} target="_blank" rel="noreferrer">View source on data.gov.my</Typography.Link>
          </span>
        )}
      />
      <Form
        form={catalogForm}
        layout="inline"
        initialValues={{ isActive: true }}
        onFinish={(values) => void saveCatalogModel(values)}
      >
        <Form.Item name="make" label="Make / 品牌" rules={[{ required: true, message: "Make is required" }]}>
          <Input placeholder="Toyota" maxLength={80} />
        </Form.Item>
        <Form.Item name="model" label="Model / 车型" rules={[{ required: true, message: "Model is required" }]}>
          <Input placeholder="Vios" maxLength={80} />
        </Form.Item>
        <Form.Item name="isActive" label="Website visible" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">{catalogEditingId ? "Update option" : "Add option"}</Button>
            {catalogEditingId && (
              <Button onClick={() => {
                setCatalogEditingId(null);
                catalogForm.resetFields();
                catalogForm.setFieldValue("isActive", true);
              }}>Cancel</Button>
            )}
          </Space>
        </Form.Item>
      </Form>
      <div className="vehicleOperationFilters">
        <Input.Search
          allowClear
          value={catalogFilters.keyword}
          placeholder="Search make or model"
          aria-label="Search vehicle catalogue by make or model"
          onChange={(event) => updateCatalogFilter("keyword", event.target.value)}
        />
        <Select
          allowClear
          placeholder="Website status"
          value={catalogFilters.status}
          options={[
            { value: "active", label: "Visible" },
            { value: "hidden", label: "Hidden" }
          ]}
          onChange={(value) => updateCatalogFilter("status", value)}
        />
        <div className="vehicleFilterMeta">
          <Tag color={catalogFilterActive ? "blue" : "default"}>{catalogFilterActive ? `${filteredCatalogModels.length} of ${catalogModels.length} matching` : `${catalogModels.length} option${catalogModels.length === 1 ? "" : "s"}`}</Tag>
          {catalogFilterActive && <Button size="small" onClick={() => { setCatalogFilters({}); setMobileCatalogPage(1); }}>Clear filters</Button>}
        </div>
      </div>
      <div className="mobileRecordList">
        {filteredCatalogModels.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No catalogue options match the current filters." />}
        {mobileCatalogModels.map((item) => (
          <article className="mobileRecordCard" key={item.id}>
            <div className="mobileRecordHeader">
              <div>
                <Typography.Text className="mobileRecordEyebrow">Website Catalogue</Typography.Text>
                <Typography.Title level={5}>{item.make}</Typography.Title>
              </div>
              <Tag color={item.isActive ? "green" : "default"}>{item.isActive ? "Visible" : "Hidden"}</Tag>
            </div>
            <div className="mobileRecordGrid">
              <div><span>Model / 车型</span><strong>{item.model}</strong></div>
              <div><span>Type</span><strong>Website filter</strong></div>
            </div>
            <div className="mobileRecordFooter">{renderCatalogActions(item)}</div>
          </article>
        ))}
        {filteredCatalogModels.length > mobileCatalogPageSize && (
          <Pagination
            current={clampedMobileCatalogPage}
            pageSize={mobileCatalogPageSize}
            total={filteredCatalogModels.length}
            showSizeChanger={false}
            onChange={setMobileCatalogPage}
          />
        )}
      </div>
      <OperationsProTable
        className="desktopDataTable"
        rowKey="id"
        columns={catalogColumns}
        dataSource={filteredCatalogModels}
        pagination={{ pageSize: 8, showSizeChanger: false, current: clampedMobileCatalogPage, onChange: setMobileCatalogPage }}
        scroll={{ x: 640 }}
        locale={{ emptyText: catalogModels.length === 0 ? "No catalogue options yet." : "No catalogue options match the current filters." }}
      />
    </Space>
  );
}
